import { v } from "convex/values";
import {
    mutation,
    internalMutation,
    internalQuery,
    query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { initializeSyncStatus } from "./products/sync";
import { createIsConnectedQuery } from "./marketplaceConnections";

export const syncShopifyOrders = mutation({
    args: {
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "shopify");

        await ctx.scheduler.runAfter(0, internal.shopify.syncShopifyOrders, {
            userId,
            syncId,
            updateExisting: args.updateExisting ?? false,
        });

        return { message: "Shopify sync started" };
    },
});

/**
 * Store Shopify connection in marketplaceConnections.
 */
export const storeShopifyConnection = internalMutation({
    args: {
        shop: v.string(),
        accessToken: v.string(),
        scope: v.string(),
        userId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        if (!args.userId) {
            throw new Error("userId is required to store Shopify connection");
        }

        await ctx.runMutation(
            internal.marketplaceConnections.storeMarketplaceConnection,
            {
                userId: args.userId,
                marketplace: "shopify",
                accessToken: args.accessToken,
                shopDomain: args.shop,
            }
        );
    },
});

/**
 * Get Shopify connection from marketplaceConnections.
 */
export const getShopifyConnection = internalQuery({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", "shopify")
            )
            .first();

        if (!connection) {
            return null;
        }

        return {
            shop: connection.shopDomain || "",
            accessToken: connection.accessToken,
        };
    },
});

export const isShopifyConnected = createIsConnectedQuery("shopify");

export const completeOAuthFlow = mutation({
    args: {
        code: v.string(),
        shop: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const siteUrl = process.env.CONVEX_SITE_URL || "";
        await ctx.scheduler.runAfter(
            0,
            internal.shopifyOAuth.exchangeCodeForToken,
            {
                code: args.code,
                shop: args.shop,
                redirectUri: `${siteUrl}/shopify/callback`,
                userId,
            }
        );

        return { success: true };
    },
});

/**
 * Get Shopify domain from marketplaceConnections.
 */
export const getShopDomain = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", userId).eq("marketplace", "shopify")
            )
            .first();

        return connection?.shopDomain || null;
    },
});
