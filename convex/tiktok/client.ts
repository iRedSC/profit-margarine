"use node";

import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { signTiktokRequest } from "./sign";
import { isRecord } from "./token";
import { parseAuthorizedShops, parseOrderSearchPage } from "./parse";
import { tiktokApiBase } from "./region";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type TiktokShop = {
    id: string;
    cipher: string;
    name?: string;
    region?: string;
};

export type TiktokApiContext = {
    accessToken: string;
    shopCipher: string;
    shopId: string;
    shops: TiktokShop[];
};

function apiBase(): string {
    return tiktokApiBase();
}

function requireAppCredentials(): { appKey: string; appSecret: string } {
    const appKey = process.env.TIKTOK_CLIENT_KEY;
    const appSecret = process.env.TIKTOK_CLIENT_SECRET;
    if (!appKey || !appSecret) {
        throw new Error("TikTok Shop OAuth credentials not configured");
    }
    return { appKey, appSecret };
}

function extractData(payload: unknown, errorPrefix: string): unknown {
    if (!isRecord(payload)) {
        throw new Error(`${errorPrefix}: invalid JSON`);
    }
    const code = payload.code;
    if (code !== undefined && code !== 0 && code !== "0") {
        const message =
            typeof payload.message === "string"
                ? payload.message
                : "TikTok Shop API error";
        const codeLabel =
            typeof code === "string" || typeof code === "number"
                ? String(code)
                : "unknown";
        throw new Error(`${errorPrefix}: ${message} (${codeLabel})`);
    }
    return payload.data ?? payload;
}

async function tiktokFetch(args: {
    path: string;
    accessToken: string;
    query?: Record<string, string>;
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
}): Promise<unknown> {
    const { appKey, appSecret } = requireAppCredentials();
    const method = args.method ?? "GET";
    const query: Record<string, string> = {
        app_key: appKey,
        timestamp: String(Math.floor(Date.now() / 1000)),
        ...(args.query ?? {}),
    };
    const bodyText =
        method === "POST" && args.body ? JSON.stringify(args.body) : undefined;
    query.sign = signTiktokRequest({
        path: args.path,
        query,
        secret: appSecret,
        body: bodyText,
    });

    const url = new URL(apiBase() + args.path);
    for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
        method,
        headers: {
            "Content-Type": "application/json",
            "x-tts-access-token": args.accessToken,
        },
        body: bodyText,
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const detail = isRecord(payload) && typeof payload.message === "string"
            ? payload.message
            : "";
        throw new Error(
            `TikTok Shop API ${args.path} failed: ${response.status}${detail ? ` ${detail}` : ""}`
        );
    }
    return extractData(payload, `TikTok Shop API ${args.path}`);
}

export async function getAuthorizedShops(
    accessToken: string
): Promise<TiktokShop[]> {
    const data = await tiktokFetch({
        path: "/authorization/202309/shops",
        accessToken,
    });
    return parseAuthorizedShops(data);
}

export async function searchTiktokOrders(args: {
    accessToken: string;
    shopCipher: string;
    createTimeGe: number;
    createTimeLt: number;
    pageToken?: string;
}): Promise<{ orderIds: string[]; nextPageToken?: string }> {
    const query: Record<string, string> = {
        shop_cipher: args.shopCipher,
        page_size: "100",
        sort_field: "create_time",
        sort_order: "ASC",
    };
    if (args.pageToken) {
        query.page_token = args.pageToken;
    }

    const data = await tiktokFetch({
        path: "/order/202309/orders/search",
        accessToken: args.accessToken,
        query,
        method: "POST",
        body: {
            create_time_ge: args.createTimeGe,
            create_time_lt: args.createTimeLt,
        },
    });

    return parseOrderSearchPage(data);
}

export async function getTiktokOrderDetails(args: {
    accessToken: string;
    shopCipher: string;
    orderIds: string[];
}): Promise<unknown[]> {
    if (args.orderIds.length === 0) {
        return [];
    }

    const data = await tiktokFetch({
        path: "/order/202309/orders",
        accessToken: args.accessToken,
        query: {
            shop_cipher: args.shopCipher,
            ids: args.orderIds.join(","),
        },
    });

    const ordersRaw = isRecord(data)
        ? (data.orders ?? data.order_list)
        : undefined;
    return Array.isArray(ordersRaw) ? ordersRaw : [];
}

export async function getOrderStatementTransactions(args: {
    accessToken: string;
    shopCipher: string;
    orderId: string;
}): Promise<unknown> {
    return await tiktokFetch({
        path: `/finance/202501/orders/${args.orderId}/statement_transactions`,
        accessToken: args.accessToken,
        query: { shop_cipher: args.shopCipher },
    });
}

export async function getTiktokApiContext(
    ctx: ActionCtx,
    userId: Id<"users">
): Promise<TiktokApiContext> {
    let connection = await ctx.runQuery(
        internal.marketplaceConnections.getMarketplaceConnection,
        { userId, marketplace: "tiktok" }
    );

    if (!connection?.accessToken) {
        throw new Error(
            "No TikTok Shop connection found. Please connect your TikTok Shop account first."
        );
    }

    if (
        connection.expiresAt &&
        connection.expiresAt < Date.now() + TOKEN_REFRESH_BUFFER_MS
    ) {
        const refreshed = await ctx.runAction(
            internal.tiktokOAuth.refreshAccessToken,
            { userId }
        );
        connection = {
            ...connection,
            accessToken: refreshed.accessToken,
        };
    }

    const shops = await getAuthorizedShops(connection.accessToken);
    const shop = shops[0];
    if (!shop) {
        throw new Error(
            `No authorized TikTok Shop found for this account (${apiBase()}).`
        );
    }

    return {
        accessToken: connection.accessToken,
        shopCipher: shop.cipher,
        shopId: shop.id,
        shops,
    };
}
