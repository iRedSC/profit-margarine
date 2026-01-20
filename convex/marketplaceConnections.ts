import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export type MarketplaceType = "amazon" | "ebay" | "shopify" | "tiktok";

/**
 * Generic connection storage for marketplaceConnections table (eBay)
 * Note: Shopify uses a separate shopifyConnections table
 */
export const storeMarketplaceConnection = internalMutation({
    args: {
        userId: v.id("users"),
        marketplace: v.union(v.literal("ebay"), v.literal("shopify"), v.literal("tiktok")),
        accessToken: v.string(),
        refreshToken: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        shopDomain: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", args.marketplace)
            )
            .first();

        const connectionData: any = {
            userId: args.userId,
            marketplace: args.marketplace,
            accessToken: args.accessToken,
            connectedAt: Date.now(),
        };

        if (args.refreshToken) {
            connectionData.refreshToken = args.refreshToken;
        }
        if (args.expiresAt) {
            connectionData.expiresAt = args.expiresAt;
        }
        if (args.shopDomain) {
            connectionData.shopDomain = args.shopDomain;
        }

        if (existing) {
            await ctx.db.patch(existing._id, connectionData);
        } else {
            await ctx.db.insert("marketplaceConnections", connectionData);
        }
    },
});

/**
 * Generic connection retrieval for marketplaceConnections table
 * Also handles Shopify's legacy shopifyConnections table for backward compatibility
 */
export const getMarketplaceConnection = internalQuery({
    args: {
        userId: v.id("users"),
        marketplace: v.union(v.literal("ebay"), v.literal("shopify"), v.literal("tiktok")),
    },
    handler: async (ctx, args) => {
        // Try marketplaceConnections first
        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", args.marketplace)
            )
            .first();

        if (connection) {
            return {
                accessToken: connection.accessToken,
                refreshToken: connection.refreshToken,
                expiresAt: connection.expiresAt,
                shopDomain: connection.shopDomain,
            };
        }

        // Fallback to legacy shopifyConnections table for Shopify (backward compatibility)
        // Note: Migration should be handled separately via a mutation, not in a query
        if (args.marketplace === "shopify") {
            const legacyConnection = await ctx.db.query("shopifyConnections").first();
            if (legacyConnection) {
                return {
                    accessToken: legacyConnection.accessToken,
                    refreshToken: undefined,
                    expiresAt: undefined,
                    shopDomain: legacyConnection.shop,
                };
            }
        }

        return null;
    },
});

/**
 * Check if a marketplace is connected (for queries)
 */
export function createIsConnectedQuery(marketplace: "ebay" | "shopify" | "tiktok") {
    return query({
        args: {},
        handler: async (ctx) => {
            const userId = await getAuthUserId(ctx);
            if (!userId) {
                return false;
            }

            const connection = await ctx.db
                .query("marketplaceConnections")
                .withIndex("by_user_and_marketplace", (q) =>
                    q.eq("userId", userId).eq("marketplace", marketplace)
                )
                .first();

            return connection !== null;
        },
    });
}
