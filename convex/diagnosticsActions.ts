"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { cleanErrorMessage } from "./lib/errorText";
import {
    FULFILLMENT_ORDER_SCOPES,
    fetchShopifyAccessScopes,
    fetchShopifyGraphQL,
    hasFulfillmentOrderScope,
} from "./shopify/graphql";
import {
    getAuthorizedShops,
    getTiktokApiContext,
    searchTiktokOrders,
} from "./tiktok/client";
import { tiktokApiBase } from "./tiktok/region";
import { getEbayAccessToken } from "./ebay/transactions";
import { fetchAmazonOrders, getSellingPartnerAPI } from "./amazon/client";

export type CheckStep = {
    label: string;
    status: "ok" | "warn" | "fail";
    detail: string;
    durationMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Runs each step in order and stops at the first failure, since later steps
 * depend on earlier ones (no token means no API call). A step returns its
 * detail string, or throws; `warn` lets a step pass while flagging a problem.
 */
class CheckRunner {
    steps: CheckStep[] = [];
    failed = false;

    async step(
        label: string,
        run: () => Promise<string | { warn: string }>
    ): Promise<void> {
        if (this.failed) return;
        const started = Date.now();
        try {
            const result = await run();
            this.steps.push({
                label,
                status: typeof result === "string" ? "ok" : "warn",
                detail: typeof result === "string" ? result : result.warn,
                durationMs: Date.now() - started,
            });
        } catch (error: unknown) {
            this.failed = true;
            this.steps.push({
                label,
                status: "fail",
                detail: cleanErrorMessage(error),
                durationMs: Date.now() - started,
            });
        }
    }
}

async function checkShopify(ctx: ActionCtx, userId: Id<"users">, r: CheckRunner) {
    let shop = "";
    let accessToken = "";
    await r.step("Saved connection", async () => {
        const connection = await ctx.runQuery(
            internal.shopifyMutations.getShopifyConnection,
            { userId }
        );
        if (!connection?.shop) throw new Error("No Shopify connection saved.");
        shop = connection.shop;
        accessToken = connection.accessToken;
        return shop;
    });
    await r.step("Authenticate (shop query)", async () => {
        const data = await fetchShopifyGraphQL<{ shop: { name: string } }>(
            "{ shop { name } }",
            {},
            shop,
            accessToken
        );
        return `Token works for "${data.shop.name}"`;
    });
    await r.step("Granted API scopes", async () => {
        const scopes = await fetchShopifyAccessScopes(shop, accessToken);
        await ctx.runMutation(internal.shopifyMutations.updateShopifyScopes, {
            userId,
            scopes: scopes.join(" "),
        });
        const missing = ["read_orders", "read_reports"].filter(
            (scope) => !scopes.includes(scope)
        );
        if (missing.length > 0) {
            throw new Error(
                `Missing required scopes: ${missing.join(", ")}. Granted: ${scopes.join(", ")}`
            );
        }
        const warnings: string[] = [];
        if (!hasFulfillmentOrderScope(scopes)) {
            warnings.push(
                `No fulfillment-order scope (${FULFILLMENT_ORDER_SCOPES[0]}), so local pickup orders can't be detected`
            );
        }
        if (!scopes.includes("read_all_orders")) {
            warnings.push(
                "No read_all_orders, so orders older than 60 days can't be read"
            );
        }
        const summary = `Granted: ${scopes.join(", ")}`;
        return warnings.length > 0
            ? { warn: `${warnings.join(". ")}. ${summary}` }
            : summary;
    });
    await r.step("Fetch latest order", async () => {
        const data = await fetchShopifyGraphQL<{
            orders: { nodes: Array<{ name: string; createdAt: string }> };
        }>(
            "{ orders(first: 1, reverse: true) { nodes { name createdAt } } }",
            {},
            shop,
            accessToken
        );
        const order = data.orders.nodes[0];
        return order
            ? `${order.name} created ${order.createdAt}`
            : { warn: "The store returned no orders" };
    });
}

async function checkTiktok(ctx: ActionCtx, userId: Id<"users">, r: CheckRunner) {
    await r.step("App credentials", async () => {
        if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) {
            throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set on this deployment.");
        }
        return `API host ${tiktokApiBase()}`;
    });
    await r.step("Saved connection", async () => {
        const connection = await ctx.runQuery(
            internal.marketplaceConnections.getMarketplaceConnection,
            { userId, marketplace: "tiktok" }
        );
        if (!connection) throw new Error("No TikTok connection saved.");
        if (!connection.refreshToken) {
            throw new Error("No refresh token saved. Reconnect TikTok.");
        }
        if (!connection.expiresAt) return "Token expiry unknown";
        const expired = connection.expiresAt < Date.now();
        return `Access token ${expired ? "expired" : "expires"} ${new Date(connection.expiresAt).toISOString()}${expired ? " (will refresh next)" : ""}`;
    });
    let accessToken = "";
    let shopCipher = "";
    await r.step("Token (refresh if expired)", async () => {
        const api = await getTiktokApiContext(ctx, userId);
        accessToken = api.accessToken;
        shopCipher = api.shopCipher;
        return "Access token valid";
    });
    await r.step("Authorized shops", async () => {
        const shops = await getAuthorizedShops(accessToken);
        return shops
            .map((shop) => `${shop.name ?? shop.id} (${shop.region ?? "?"})`)
            .join(", ");
    });
    await r.step("Search orders (last 7 days)", async () => {
        const now = Math.floor(Date.now() / 1000);
        const page = await searchTiktokOrders({
            accessToken,
            shopCipher,
            createTimeGe: now - 7 * 24 * 60 * 60,
            createTimeLt: now,
        });
        return `${page.orderIds.length}${page.nextPageToken ? "+" : ""} orders found`;
    });
}

async function checkEbay(ctx: ActionCtx, userId: Id<"users">, r: CheckRunner) {
    let accessToken = "";
    await r.step("Token (refresh if expired)", async () => {
        accessToken = await getEbayAccessToken(ctx, userId);
        return "Access token available";
    });
    await r.step("Finances API (last 7 days)", async () => {
        const baseUrl =
            process.env.EBAY_SANDBOX === "true"
                ? "https://apiz.sandbox.ebay.com"
                : "https://apiz.ebay.com";
        const url = new URL(`${baseUrl}/sell/finances/v1/transaction`);
        url.searchParams.set("limit", "1");
        url.searchParams.set(
            "filter",
            `transactionDate:[${new Date(Date.now() - 7 * DAY_MS).toISOString()}..]`
        );
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const text = await response.text();
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        }
        const total = (JSON.parse(text) as { total?: number }).total;
        return `${total ?? "?"} transactions`;
    });
}

async function checkAmazon(ctx: ActionCtx, userId: Id<"users">, r: CheckRunner) {
    let spApi: ReturnType<typeof getSellingPartnerAPI> | undefined;
    await r.step("App credentials", async () => {
        await ctx.runQuery(internal.amazonOwner.assertAmazonOwner, { userId });
        spApi = getSellingPartnerAPI();
        return `Region ${process.env.AMAZON_REGION}`;
    });
    await r.step("Orders API (last 24 hours)", async () => {
        if (!spApi) throw new Error("No SP-API client");
        const orders = await fetchAmazonOrders(spApi, {
            MarketplaceIds: ["ATVPDKIKX0DER"],
            LastUpdatedAfter: new Date(Date.now() - DAY_MS).toISOString(),
        });
        return `${orders.length} orders updated`;
    });
}

/**
 * Live, step-by-step connectivity check for one marketplace. Read-only apart
 * from the normal token refresh a sync would also do.
 */
export const runConnectionCheck = action({
    args: {
        marketplace: v.union(
            v.literal("shopify"),
            v.literal("tiktok"),
            v.literal("ebay"),
            v.literal("amazon")
        ),
    },
    handler: async (ctx, args): Promise<{ steps: CheckStep[]; ranAt: number }> => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const runner = new CheckRunner();
        if (args.marketplace === "shopify") await checkShopify(ctx, userId, runner);
        if (args.marketplace === "tiktok") await checkTiktok(ctx, userId, runner);
        if (args.marketplace === "ebay") await checkEbay(ctx, userId, runner);
        if (args.marketplace === "amazon") await checkAmazon(ctx, userId, runner);
        return { steps: runner.steps, ranAt: Date.now() };
    },
});
