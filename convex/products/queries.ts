import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "../_generated/dataModel";

export const listProducts = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return [];
        }

        // Debug: Check all marketplace products for this user
        const allMarketplaceProducts = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        // Instead of querying per product, use the direct marketplace products query
        // and join with product data
        const result = [];
        for (const mp of allMarketplaceProducts) {
            if (!mp.productId) {
                // Handle legacy data without productId
                result.push({
                    _id: mp._id,
                    productId: undefined,
                    sku: mp.sku || "Unknown",
                    name: mp.name || "Unknown Product",
                    cost: mp.cost,
                    marketplace: mp.marketplace,
                    price: mp.price,
                    fees: mp.fees,
                    fees_breakdown: mp.fees_breakdown,
                    shipping: mp.shipping,
                    shipping_breakdown: mp.shipping_breakdown,
                    shippingPercentage: mp.shippingPercentage,
                    buyerPaidShipping: mp.buyerPaidShipping,
                    orderDate: mp.orderDate,
                    fulfillmentDate: mp.fulfillmentDate,
                    orderId: mp.orderId,
                    OrderId: mp.OrderId,
                });
                continue;
            }

            const product = await ctx.db.get(mp.productId);
            if (!product || product.userId !== userId) {
                continue;
            }
            if (product && product.userId === userId) {
                result.push({
                    _id: mp._id,
                    productId: product._id,
                    sku: product.sku,
                    name: product.name || "Unknown Product",
                    cost: mp.cost !== undefined ? mp.cost : product.cost,
                    marketplace: mp.marketplace,
                    price: mp.price,
                    fees: mp.fees,
                    fees_breakdown: mp.fees_breakdown,
                    shipping: mp.shipping,
                    shipping_breakdown: mp.shipping_breakdown,
                    shippingPercentage: mp.shippingPercentage,
                    buyerPaidShipping: mp.buyerPaidShipping,
                    orderDate: mp.orderDate,
                    fulfillmentDate: mp.fulfillmentDate,
                    orderId: mp.orderId,
                    OrderId: mp.OrderId,
                });
            }
        }

        return result;
    },
});

export const getLastSyncTime = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        // Get the most recent finished sync
        const finishedSyncs = await ctx.db
            .query("syncs")
            .withIndex("by_user_and_status", (q) =>
                q.eq("userId", userId).eq("status", "finished")
            )
            .order("desc")
            .first();

        return finishedSyncs?.finishedAt || null;
    },
});

export const getSyncStatus = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        // Get all active syncs
        const activeSyncs = await ctx.db
            .query("syncs")
            .withIndex("by_user_and_status", (q) =>
                q.eq("userId", userId).eq("status", "active")
            )
            .collect();

        return activeSyncs.map((sync) => ({
            _id: sync._id,
            marketplace: sync.marketplace,
            status: sync.status,
            total: sync.total,
            complete: sync.complete,
            message: sync.message || null,
            startedAt: sync.startedAt,
            finishedAt: sync.finishedAt || null,
            error: sync.error || null,
        }));
    },
});

export const checkOrderExists = internalQuery({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        orderDate: v.number(),
    },
    handler: async (ctx, args) => {
        // Query all products with this orderId
        const productsWithOrderId = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .collect();

        // Check if any have matching orderDate
        return productsWithOrderId.some(
            (p) => p.userId === args.userId && p.orderDate === args.orderDate
        );
    },
});

export const getSyncById = internalQuery({
    args: {
        syncId: v.id("syncs"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.syncId);
    },
});

export const getMarketplaceProduct = internalQuery({
    args: {
        marketplaceProductId: v.id("marketplaceProducts"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.marketplaceProductId);
    },
});

export const getAllMarketplaceProductsWithOrders = internalQuery({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const allMarketplaceProducts = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect();

        // Group by marketplace and orderId, keeping track of one marketplaceProductId per order
        const orderMap = new Map<
            string,
            {
                marketplaceProductId: Id<"marketplaceProducts">;
                marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
                orderId: string;
            }
        >();

        for (const mp of allMarketplaceProducts) {
            const orderId = mp.orderId || mp.OrderId;
            if (!orderId) continue;

            const key = `${mp.marketplace}:${orderId}`;
            if (!orderMap.has(key)) {
                orderMap.set(key, {
                    marketplaceProductId: mp._id,
                    marketplace: mp.marketplace,
                    orderId: orderId,
                });
            }
        }

        return Array.from(orderMap.values());
    },
});
