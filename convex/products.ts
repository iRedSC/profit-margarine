import { v } from "convex/values";
import {
    mutation,
    query,
    internalMutation,
    internalQuery,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { initializeSyncStatus } from "./marketplaceSync";
import { SyncMessages } from "./syncMessages";

export const addProduct = mutation({
    args: {
        sku: v.string(),
        name: v.string(),
        marketplace: v.union(
            v.literal("Ebay"),
            v.literal("Amazon"),
            v.literal("Shopify"),
            v.literal("TikTok")
        ),
        price: v.number(),
        cost: v.number(),
        fees: v.number(),
        shipping: v.number(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const existingProduct = await ctx.db
            .query("products")
            .withIndex("by_user_and_sku", (q) =>
                q.eq("userId", userId).eq("sku", args.sku)
            )
            .first();

        let productId: Id<"products">;

        let productCost: number | undefined;

        if (existingProduct) {
            productId = existingProduct._id;
            productCost = existingProduct.cost;
        } else {
            productId = await ctx.db.insert("products", {
                sku: args.sku,
                name: args.name,
                cost: args.cost,
                userId,
            });
            productCost = args.cost;
        }

        await ctx.db.insert("marketplaceProducts", {
            productId,
            marketplace: args.marketplace,
            price: args.price,
            cost: productCost,
            fees: args.fees,
            shipping: args.shipping,
            orderDate: Date.now(),
            userId,
        });
    },
});

export const updateMarketplaceCost = mutation({
    args: {
        marketplaceProductId: v.id("marketplaceProducts"),
        cost: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const mp = await ctx.db.get(args.marketplaceProductId);
        if (!mp || mp.userId !== userId) {
            throw new Error("Not found or unauthorized");
        }

        // Update the marketplace product cost
        await ctx.db.patch(args.marketplaceProductId, { cost: args.cost });

        // Update the associated product cost if it exists
        if (mp.productId) {
            await ctx.db.patch(mp.productId, { cost: args.cost });

            // Propagate to all marketplace products without a cost set
            const allMps = await ctx.db
                .query("marketplaceProducts")
                .withIndex("by_product", (q) => q.eq("productId", mp.productId))
                .collect();

            for (const otherMp of allMps) {
                if (
                    otherMp._id !== args.marketplaceProductId &&
                    otherMp.cost === undefined
                ) {
                    await ctx.db.patch(otherMp._id, { cost: args.cost });
                }
            }
        }

        return null;
    },
});

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

        const products = await ctx.db
            .query("products")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        // Instead of querying per product, use the direct marketplace products query
        // and join with product data
        const result = [];
        let skippedCount = 0;
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
                skippedCount++;
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

export const deleteMarketplaceProduct = mutation({
    args: {
        id: v.id("marketplaceProducts"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const marketplaceProduct = await ctx.db.get(args.id);
        if (!marketplaceProduct || marketplaceProduct.userId !== userId) {
            throw new Error("Marketplace product not found or unauthorized");
        }

        await ctx.db.delete(args.id);

        if (marketplaceProduct.productId) {
            const remainingMarketplaceProducts = await ctx.db
                .query("marketplaceProducts")
                .withIndex("by_product", (q) =>
                    q.eq("productId", marketplaceProduct.productId)
                )
                .collect();

            if (remainingMarketplaceProducts.length === 0) {
                await ctx.db.delete(marketplaceProduct.productId);
            }
        }
    },
});

export const deleteMarketplaceProductsByOrder = internalMutation({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        orderDate: v.number(),
    },
    handler: async (ctx, args) => {
        // Find all marketplace products for this order
        const existingMarketplaceProducts = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("orderDate"), args.orderDate)
                )
            )
            .collect();

        // Track product IDs to check if they should be deleted
        const productIdsToCheck = new Set<Id<"products">>();

        // Delete all marketplace products for this order
        for (const mp of existingMarketplaceProducts) {
            if (mp.productId) {
                productIdsToCheck.add(mp.productId);
            }
            await ctx.db.delete(mp._id);
        }

        // Delete products that no longer have any marketplace products
        for (const productId of productIdsToCheck) {
            const remainingMarketplaceProducts = await ctx.db
                .query("marketplaceProducts")
                .withIndex("by_product", (q) => q.eq("productId", productId))
                .collect();

            if (remainingMarketplaceProducts.length === 0) {
                await ctx.db.delete(productId);
            }
        }
    },
});


export const syncEbayOrders = mutation({
    args: {
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "ebay");

        await ctx.scheduler.runAfter(0, internal.ebay.syncEbayOrders, {
            userId,
            syncId,
            updateExisting: args.updateExisting ?? false,
        });

        return { message: "eBay sync started" };
    },
});

export const syncAmazonOrders = mutation({
    args: {
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "amazon");

        await ctx.scheduler.runAfter(0, internal.amazon.syncAmazonOrders, {
            userId,
            syncId,
            updateExisting: args.updateExisting ?? false,
        });

        return { message: "Amazon sync started" };
    },
});

export const syncAmazonOrdersOneYear = mutation({
    args: {},
    handler: async (ctx) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "amazon");
        await ctx.db.patch(syncId, { message: SyncMessages.startingOneYear("amazon") });

        await ctx.scheduler.runAfter(
            0,
            internal.amazon.syncAmazonOrdersOneYear,
            {
                userId,
                syncId,
            }
        );

        return { message: "Amazon 1-year sync started" };
    },
});

export const syncEbayOrdersOneYear = mutation({
    args: {},
    handler: async (ctx) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "ebay");
        await ctx.db.patch(syncId, { message: SyncMessages.startingOneYear("ebay") });

        await ctx.scheduler.runAfter(0, internal.ebay.syncEbayOrdersOneYear, {
            userId,
            syncId,
        });

        return { message: "eBay 1-year sync started" };
    },
});

export const syncShopifyOrdersOneYear = mutation({
    args: {},
    handler: async (ctx) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "shopify");
        await ctx.db.patch(syncId, { message: SyncMessages.startingOneYear("shopify") });

        await ctx.scheduler.runAfter(
            0,
            internal.shopify.syncShopifyOrdersOneYear,
            {
                userId,
                syncId,
            }
        );

        return { message: "Shopify 1-year sync started" };
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

        return activeSyncs.map(sync => ({
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

export const updateSyncProgress = internalMutation({
    args: {
        syncId: v.id("syncs"),
        message: v.string(),
        total: v.optional(v.number()),
        complete: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        const patch: any = {
            message: args.message,
        };

        if (args.total !== undefined) {
            patch.total = args.total;
        }
        if (args.complete !== undefined) {
            patch.complete = args.complete;
        }

        await ctx.db.patch(args.syncId, patch);
    },
});

export const finishSync = internalMutation({
    args: {
        syncId: v.id("syncs"),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        await ctx.db.patch(args.syncId, {
            status: "finished",
            message: args.message,
            finishedAt: Date.now(),
        });
    },
});

export const failSync = internalMutation({
    args: {
        syncId: v.id("syncs"),
        error: v.string(),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        await ctx.db.patch(args.syncId, {
            status: "finished",
            error: args.error,
            message: args.message,
            finishedAt: Date.now(),
        });
    },
});

export const cancelSync = internalMutation({
    args: {
        syncId: v.id("syncs"),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        await ctx.db.patch(args.syncId, {
            status: "canceled",
            message: args.message,
            finishedAt: Date.now(),
        });
    },
});

export const cancelActiveSyncsForMarketplace = internalMutation({
    args: {
        userId: v.id("users"),
        marketplace: v.union(
            v.literal("amazon"),
            v.literal("ebay"),
            v.literal("shopify")
        ),
    },
    handler: async (ctx, args) => {
        const activeSyncs = await ctx.db
            .query("syncs")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", args.marketplace)
            )
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        for (const sync of activeSyncs) {
            await ctx.db.patch(sync._id, {
                status: "canceled",
                message: SyncMessages.canceledForNewSync(),
                finishedAt: Date.now(),
            });
        }
    },
});

export const cancelAllActiveSyncs = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        // Get all active syncs for the user
        const activeSyncs = await ctx.db
            .query("syncs")
            .withIndex("by_user_and_status", (q) =>
                q.eq("userId", userId).eq("status", "active")
            )
            .collect();

        // Cancel all active syncs
        for (const sync of activeSyncs) {
            await ctx.db.patch(sync._id, {
                status: "canceled",
                message: SyncMessages.canceled("user requested"),
                finishedAt: Date.now(),
            });
        }

        return { canceled: activeSyncs.length };
    },
});

export const upsertProductFromAmazon = internalMutation({
    args: {
        userId: v.id("users"),
        sku: v.string(),
        name: v.string(),
        price: v.number(),
        fees: v.number(),
        fees_breakdown: v.optional(v.array(v.array(v.union(v.string(), v.number())))),
        shipping: v.number(),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        orderTimestamp: v.number(),
        fulfillmentTimestamp: v.optional(v.number()),
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
                        q.eq(q.field("marketplace"), "Amazon")
                    )
                )
                .collect();

            if (existingMarketplaceProducts.length > 0) {
                // Update all matching marketplace products (not just the first one)
                // This ensures all items/units in an order get their fulfillment dates updated
                for (const existingMp of existingMarketplaceProducts) {
                    await ctx.db.patch(existingMp._id, {
                        productId,
                        price: args.price,
                        cost: existingProduct?.cost,
                        fees: args.fees,
                        fees_breakdown: args.fees_breakdown,
                        shipping: args.shipping,
                        shippingPercentage: args.shippingPercentage,
                        buyerPaidShipping: args.buyerPaidShipping,
                        fulfillmentDate: args.fulfillmentTimestamp,
                        OrderId: args.OrderId,
                        name: args.name,
                    });
                }
                return;
            }
        }

        // Insert new marketplace product
        await ctx.db.insert("marketplaceProducts", {
            productId,
            marketplace: "Amazon",
            price: args.price,
            cost: existingProduct?.cost,
            fees: args.fees,
            fees_breakdown: args.fees_breakdown,
            shipping: args.shipping,
            shippingPercentage: args.shippingPercentage,
            buyerPaidShipping: args.buyerPaidShipping,
            orderDate: args.orderTimestamp,
            fulfillmentDate: args.fulfillmentTimestamp,
            userId: args.userId,
            orderId: args.orderId,
            OrderId: args.OrderId,
            sku: args.sku,
            name: args.name,
        });
    },
});

export const upsertProductFromEbay = internalMutation({
    args: {
        userId: v.id("users"),
        sku: v.string(),
        name: v.string(),
        price: v.number(),
        fees: v.number(),
        fees_breakdown: v.optional(v.array(v.array(v.union(v.string(), v.number())))),
        shipping: v.number(),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        orderTimestamp: v.number(),
        fulfillmentTimestamp: v.optional(v.number()),
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

        // Note: When updateExisting is true, all marketplace products for the order
        // should have been deleted before this function is called (in processEbayOrder).
        // So we just insert new ones here.

        // Insert new marketplace product
        await ctx.db.insert("marketplaceProducts", {
            productId,
            marketplace: "Ebay",
            price: args.price,
            cost: existingProduct?.cost,
            fees: args.fees,
            fees_breakdown: args.fees_breakdown,
            shipping: args.shipping,
            shippingPercentage: args.shippingPercentage,
            buyerPaidShipping: args.buyerPaidShipping,
            orderDate: args.orderTimestamp,
            fulfillmentDate: args.fulfillmentTimestamp,
            userId: args.userId,
            orderId: args.orderId,
            OrderId: args.OrderId,
            sku: args.sku,
            name: args.name,
        });
    },
});

export const resyncOrder = mutation({
    args: {
        marketplaceProductId: v.id("marketplaceProducts"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const mp = await ctx.db.get(args.marketplaceProductId);
        if (!mp || mp.userId !== userId) {
            throw new Error("Marketplace product not found or unauthorized");
        }

        if (!mp.orderId && !mp.OrderId) {
            throw new Error("Order ID not found for this product");
        }

        // Schedule the resync action
        await ctx.scheduler.runAfter(0, internal.productResync.resyncOrderAction, {
            userId,
            marketplaceProductId: args.marketplaceProductId,
            marketplace: mp.marketplace,
            orderId: mp.orderId || mp.OrderId || "",
        });

        return { message: "Order resync started" };
    },
});

export const resyncAllOrders = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        // Create a sync record for tracking progress
        // Use "amazon" as the marketplace type but with a custom message
        const syncId = await ctx.db.insert("syncs", {
            userId,
            marketplace: "amazon", // Using "amazon" as placeholder, message will indicate it's for all
            status: "active",
            total: 0,
            complete: 0,
            message: "Resyncing all orders from existing marketplace products...",
            startedAt: Date.now(),
        });

        // Schedule the resync action
        await ctx.scheduler.runAfter(0, internal.productResync.resyncAllOrdersAction, {
            userId,
            syncId,
        });

        return { message: "Resync all orders started" };
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
        const orderMap = new Map<string, {
            marketplaceProductId: Id<"marketplaceProducts">;
            marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
            orderId: string;
        }>();

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