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

export const upsertProductFromShopify = internalMutation({
    args: {
        userId: v.id("users"),
        sku: v.string(),
        name: v.string(),
        price: v.number(),
        fees: v.number(),
        shipping: v.number(),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        orderTimestamp: v.number(),
        orderId: v.string(),
        OrderId: v.string(),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        // Skip orders with 0 shipping cost (not yet shipped)
        if (args.shipping === 0) {
            return;
        }

        const existingProduct = await ctx.db
            .query("products")
            .withIndex("by_user_and_sku", (q) =>
                q.eq("userId", args.userId).eq("sku", args.sku)
            )
            .first();

        let productId: Id<"products">;

        if (existingProduct) {
            productId = existingProduct._id;
            await ctx.db.patch(productId, {
                name: args.name,
            });
        } else {
            productId = await ctx.db.insert("products", {
                sku: args.sku,
                name: args.name,
                userId: args.userId,
            });
        }

        // Check if marketplace product already exists for this order, date, and SKU
        if (args.updateExisting && args.orderId) {
            const existingMarketplaceProducts = await ctx.db
                .query("marketplaceProducts")
                .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
                .filter((q) =>
                    q.and(
                        q.eq(q.field("userId"), args.userId),
                        q.eq(q.field("orderDate"), args.orderTimestamp),
                        q.eq(q.field("sku"), args.sku),
                        q.eq(q.field("marketplace"), "Shopify")
                    )
                )
                .collect();

            if (existingMarketplaceProducts.length > 0) {
                // Update the first matching marketplace product
                const existingMp = existingMarketplaceProducts[0];
                await ctx.db.patch(existingMp._id, {
                    productId,
                    price: args.price,
                    cost: existingProduct?.cost,
                    fees: args.fees,
                    shipping: args.shipping,
                    shippingPercentage: args.shippingPercentage,
                    buyerPaidShipping: args.buyerPaidShipping,
                    OrderId: args.OrderId,
                    name: args.name,
                });
                return;
            }
        }

        // Insert new marketplace product
        await ctx.db.insert("marketplaceProducts", {
            productId,
            marketplace: "Shopify",
            price: args.price,
            cost: existingProduct?.cost,
            fees: args.fees,
            shipping: args.shipping,
            shippingPercentage: args.shippingPercentage,
            buyerPaidShipping: args.buyerPaidShipping,
            orderDate: args.orderTimestamp,
            userId: args.userId,
            orderId: args.orderId,
            OrderId: args.OrderId,
            sku: args.sku,
            name: args.name,
        });
    },
});

export const storeShopifyConnection = internalMutation({
    args: {
        shop: v.string(),
        accessToken: v.string(),
        scope: v.string(),
    },
    handler: async (ctx, args) => {
        // For now, we'll store this globally
        // In a multi-user app, you'd associate this with a specific user
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

export const getShopifyConnection = internalQuery({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, _args) => {
        const connection = await ctx.db.query("shopifyConnections").first();

        if (!connection) {
            return null;
        }

        return {
            shop: connection.shop,
            accessToken: connection.accessToken,
        };
    },
});

export const isShopifyConnected = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return false;
        }

        const connection = await ctx.db.query("shopifyConnections").first();
        return connection !== null;
    },
});

export const getShopDomain = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        const connection = await ctx.db.query("shopifyConnections").first();
        return connection?.shop || null;
    },
});
