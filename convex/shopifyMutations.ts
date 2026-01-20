import { v } from "convex/values";
import {
    mutation,
    internalMutation,
    internalQuery,
    query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { initializeSyncStatus } from "./marketplaceSync";

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
 * @deprecated Use products.upsertMarketplaceProduct instead
 * Kept for backward compatibility during migration
 * Note: This now calls the shared handler function directly
 */
export const upsertProductFromShopify = internalMutation({
    args: {
        userId: v.id("users"),
        sku: v.string(),
        name: v.string(),
        price: v.number(),
        fees: v.number(),
        fees_breakdown: v.optional(v.array(v.array(v.union(v.string(), v.number())))),
        shipping: v.number(),
        shipping_breakdown: v.optional(v.array(v.array(v.union(v.string(), v.number())))),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        orderTimestamp: v.number(),
        fulfillmentTimestamp: v.optional(v.number()),
        orderId: v.string(),
        OrderId: v.string(),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        // Import the handler function - note: this requires the handler to be exported
        // For now, we'll use the internal API call which works from mutations
        await ctx.runMutation(internal.products.upsertMarketplaceProduct, {
            userId: args.userId,
            marketplace: "Shopify",
            sku: args.sku,
            name: args.name,
            price: args.price,
            fees: args.fees,
            fees_breakdown: args.fees_breakdown,
            shipping: args.shipping,
            shipping_breakdown: args.shipping_breakdown,
            shippingPercentage: args.shippingPercentage,
            buyerPaidShipping: args.buyerPaidShipping,
            orderTimestamp: args.orderTimestamp,
            fulfillmentTimestamp: args.fulfillmentTimestamp,
            orderId: args.orderId,
            OrderId: args.OrderId,
            updateExisting: args.updateExisting,
        });
    },
});

/**
 * Store Shopify connection using unified marketplaceConnections table
 * Also maintains legacy shopifyConnections table for backward compatibility
 */
export const storeShopifyConnection = internalMutation({
    args: {
        shop: v.string(),
        accessToken: v.string(),
        scope: v.string(),
        userId: v.optional(v.id("users")),
    },
    handler: async (ctx, args) => {
        // Store in unified marketplaceConnections if userId is provided
        if (args.userId) {
            await ctx.runMutation(internal.marketplaceConnections.storeMarketplaceConnection, {
                userId: args.userId,
                marketplace: "shopify",
                accessToken: args.accessToken,
                shopDomain: args.shop,
            });
        }

        // Also maintain legacy shopifyConnections table for backward compatibility
        const existing = await ctx.db
            .query("shopifyConnections")
            .withIndex("by_shop", (q) => q.eq("shop", args.shop))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                accessToken: args.accessToken,
                scope: args.scope,
                updatedAt: Date.now(),
            });
        } else {
            await ctx.db.insert("shopifyConnections", {
                shop: args.shop,
                accessToken: args.accessToken,
                scope: args.scope,
                connectedAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
    },
});

/**
 * Get Shopify connection using unified marketplaceConnections system
 * Falls back to legacy shopifyConnections table for backward compatibility
 */
export const getShopifyConnection = internalQuery({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        // Try unified marketplaceConnections first
        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", "shopify")
            )
            .first();

        if (connection) {
            return {
                shop: connection.shopDomain || "",
                accessToken: connection.accessToken,
            };
        }

        // Fallback to legacy shopifyConnections table
        const legacyConnection = await ctx.db.query("shopifyConnections").first();
        if (legacyConnection) {
            return {
                shop: legacyConnection.shop,
                accessToken: legacyConnection.accessToken,
            };
        }

        return null;
    },
});

/**
 * Check if Shopify is connected using unified marketplaceConnections system
 */
export const isShopifyConnected = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return false;
        }

        // Try unified marketplaceConnections first
        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", userId).eq("marketplace", "shopify")
            )
            .first();

        if (connection) {
            return true;
        }

        // Fallback to legacy shopifyConnections table
        const legacyConnection = await ctx.db.query("shopifyConnections").first();
        return legacyConnection !== null;
    },
});

/**
 * Get Shopify domain using unified marketplaceConnections system
 */
export const getShopDomain = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        // Try unified marketplaceConnections first
        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", userId).eq("marketplace", "shopify")
            )
            .first();

        if (connection?.shopDomain) {
            return connection.shopDomain;
        }

        // Fallback to legacy shopifyConnections table
        const legacyConnection = await ctx.db.query("shopifyConnections").first();
        return legacyConnection?.shop || null;
    },
});
