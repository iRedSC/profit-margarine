import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "../_generated/dataModel";

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

async function upsertPendingMarketplaceImportHandler(
    ctx: any,
    args: {
        userId: Id<"users">;
        marketplace: "Amazon" | "Ebay" | "Shopify" | "TikTok";
        sku: string;
        name: string;
        quantity: number;
        price: number;
        fees: number;
        fees_breakdown?: Array<Array<string | number>>;
        shipping: number;
        shipping_breakdown?: Array<Array<string | number>>;
        shippingPercentage?: number;
        buyerPaidShipping?: number;
        orderTimestamp: number;
        fulfillmentTimestamp?: number;
        orderId: string;
        OrderId?: string;
        reasonCode: string;
        reasonMessage: string;
        rawFinancialEventsStatus?: {
            hasShipmentFinancialEvents: boolean;
            hasShipmentEventList: boolean;
            shipmentEventListLength: number;
            hasAdjustmentEventList: boolean;
            adjustmentEventListLength: number;
            pagesFetched: number;
            usedEstimatedFees: boolean;
            missingFulfillmentDate: boolean;
        };
        lastAttemptAt: number;
    }
) {
    const existingPendingImports = await ctx.db
        .query("pendingMarketplaceImports")
        .withIndex("by_order_id", (q: any) => q.eq("orderId", args.orderId))
        .filter((q: any) =>
            q.and(
                q.eq(q.field("userId"), args.userId),
                q.eq(q.field("orderDate"), args.orderTimestamp),
                q.eq(q.field("sku"), args.sku),
                q.eq(q.field("marketplace"), args.marketplace)
            )
        )
        .collect();

    if (existingPendingImports.length > 0) {
        for (const existingPendingImport of existingPendingImports) {
            await ctx.db.patch(existingPendingImport._id, {
                status: "pending",
                OrderId: args.OrderId,
                name: args.name,
                quantity: args.quantity,
                price: args.price,
                fees: args.fees,
                fees_breakdown: args.fees_breakdown,
                shipping: args.shipping,
                shipping_breakdown: args.shipping_breakdown,
                shippingPercentage: args.shippingPercentage,
                buyerPaidShipping: args.buyerPaidShipping,
                fulfillmentDate: args.fulfillmentTimestamp,
                reasonCode: args.reasonCode,
                reasonMessage: args.reasonMessage,
                rawFinancialEventsStatus: args.rawFinancialEventsStatus,
                lastAttemptAt: args.lastAttemptAt,
                resolvedAt: undefined,
            });
        }
        return;
    }

    await ctx.db.insert("pendingMarketplaceImports", {
        userId: args.userId,
        marketplace: args.marketplace,
        status: "pending",
        orderId: args.orderId,
        OrderId: args.OrderId,
        sku: args.sku,
        name: args.name,
        quantity: args.quantity,
        price: args.price,
        fees: args.fees,
        fees_breakdown: args.fees_breakdown,
        shipping: args.shipping,
        shipping_breakdown: args.shipping_breakdown,
        shippingPercentage: args.shippingPercentage,
        buyerPaidShipping: args.buyerPaidShipping,
        orderDate: args.orderTimestamp,
        fulfillmentDate: args.fulfillmentTimestamp,
        reasonCode: args.reasonCode,
        reasonMessage: args.reasonMessage,
        rawFinancialEventsStatus: args.rawFinancialEventsStatus,
        lastAttemptAt: args.lastAttemptAt,
    });
}

async function resolvePendingMarketplaceImportHandler(
    ctx: any,
    args: {
        userId: Id<"users">;
        marketplace: "Amazon" | "Ebay" | "Shopify" | "TikTok";
        sku: string;
        orderTimestamp: number;
        orderId: string;
        fulfillmentTimestamp?: number;
    }
) {
    const existingPendingImports = await ctx.db
        .query("pendingMarketplaceImports")
        .withIndex("by_order_id", (q: any) => q.eq("orderId", args.orderId))
        .filter((q: any) =>
            q.and(
                q.eq(q.field("userId"), args.userId),
                q.eq(q.field("orderDate"), args.orderTimestamp),
                q.eq(q.field("sku"), args.sku),
                q.eq(q.field("marketplace"), args.marketplace),
                q.eq(q.field("status"), "pending")
            )
        )
        .collect();

    for (const existingPendingImport of existingPendingImports) {
        await ctx.db.patch(existingPendingImport._id, {
            status: "resolved",
            fulfillmentDate:
                args.fulfillmentTimestamp ??
                existingPendingImport.fulfillmentDate,
            resolvedAt: Date.now(),
        });
    }
}

/**
 * Shared handler logic for upserting marketplace products
 */
async function upsertMarketplaceProductHandler(
    ctx: any,
    args: {
        userId: Id<"users">;
        marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
        sku: string;
        name: string;
        price: number;
        fees: number;
        fees_breakdown?: Array<Array<string | number>>;
        shipping: number;
        shipping_breakdown?: Array<Array<string | number>>;
        shippingPercentage?: number;
        buyerPaidShipping?: number;
        orderTimestamp: number;
        fulfillmentTimestamp?: number;
        orderId: string;
        OrderId: string;
        updateExisting?: boolean;
    }
) {
    // Skip orders with 0 shipping cost only if they haven't been fulfilled yet
    // If fulfillmentTimestamp exists, the order was shipped (even if shipping was reversed/refunded)
    if (args.shipping === 0 && !args.fulfillmentTimestamp) {
        return;
    }

    const existingProduct = await ctx.db
        .query("products")
        .withIndex("by_user_and_sku", (q: any) =>
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
    // Note: eBay handles updates differently (deletes first, then inserts), so skip update logic for eBay
    if (args.updateExisting && args.orderId && args.marketplace !== "Ebay") {
        const existingMarketplaceProducts = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q: any) => q.eq("orderId", args.orderId))
            .filter((q: any) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("orderDate"), args.orderTimestamp),
                    q.eq(q.field("sku"), args.sku),
                    q.eq(q.field("marketplace"), args.marketplace)
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
                    shipping_breakdown: args.shipping_breakdown,
                    shippingPercentage: args.shippingPercentage,
                    buyerPaidShipping: args.buyerPaidShipping,
                    fulfillmentDate: args.fulfillmentTimestamp,
                    OrderId: args.OrderId,
                    name: args.name,
                });
            }
            if (args.marketplace === "Amazon" && args.fulfillmentTimestamp) {
                await resolvePendingMarketplaceImportHandler(ctx, {
                    userId: args.userId,
                    marketplace: args.marketplace,
                    sku: args.sku,
                    orderTimestamp: args.orderTimestamp,
                    orderId: args.orderId,
                    fulfillmentTimestamp: args.fulfillmentTimestamp,
                });
            }
            return;
        }
    }

    // Insert new marketplace product
    await ctx.db.insert("marketplaceProducts", {
        productId,
        marketplace: args.marketplace,
        price: args.price,
        cost: existingProduct?.cost,
        fees: args.fees,
        fees_breakdown: args.fees_breakdown,
        shipping: args.shipping,
        shipping_breakdown: args.shipping_breakdown,
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

    if (args.marketplace === "Amazon" && args.fulfillmentTimestamp) {
        await resolvePendingMarketplaceImportHandler(ctx, {
            userId: args.userId,
            marketplace: args.marketplace,
            sku: args.sku,
            orderTimestamp: args.orderTimestamp,
            orderId: args.orderId,
            fulfillmentTimestamp: args.fulfillmentTimestamp,
        });
    }
}

/**
 * Unified function to upsert marketplace products from any marketplace
 */
export const upsertMarketplaceProduct = internalMutation({
    args: {
        userId: v.id("users"),
        marketplace: v.union(
            v.literal("Ebay"),
            v.literal("Amazon"),
            v.literal("Shopify"),
            v.literal("TikTok")
        ),
        sku: v.string(),
        name: v.string(),
        price: v.number(),
        fees: v.number(),
        fees_breakdown: v.optional(
            v.array(v.array(v.union(v.string(), v.number())))
        ),
        shipping: v.number(),
        shipping_breakdown: v.optional(
            v.array(v.array(v.union(v.string(), v.number())))
        ),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        orderTimestamp: v.number(),
        fulfillmentTimestamp: v.optional(v.number()),
        orderId: v.string(),
        OrderId: v.string(),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        await upsertMarketplaceProductHandler(ctx, args);
    },
});

export const upsertPendingMarketplaceImport = internalMutation({
    args: {
        userId: v.id("users"),
        marketplace: v.union(
            v.literal("Amazon"),
            v.literal("Ebay"),
            v.literal("Shopify"),
            v.literal("TikTok")
        ),
        sku: v.string(),
        name: v.string(),
        quantity: v.number(),
        price: v.number(),
        fees: v.number(),
        fees_breakdown: v.optional(
            v.array(v.array(v.union(v.string(), v.number())))
        ),
        shipping: v.number(),
        shipping_breakdown: v.optional(
            v.array(v.array(v.union(v.string(), v.number())))
        ),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        orderTimestamp: v.number(),
        fulfillmentTimestamp: v.optional(v.number()),
        orderId: v.string(),
        OrderId: v.optional(v.string()),
        reasonCode: v.string(),
        reasonMessage: v.string(),
        rawFinancialEventsStatus: v.optional(
            v.object({
                hasShipmentFinancialEvents: v.boolean(),
                hasShipmentEventList: v.boolean(),
                shipmentEventListLength: v.number(),
                hasAdjustmentEventList: v.boolean(),
                adjustmentEventListLength: v.number(),
                pagesFetched: v.number(),
                usedEstimatedFees: v.boolean(),
                missingFulfillmentDate: v.boolean(),
            })
        ),
        lastAttemptAt: v.number(),
    },
    handler: async (ctx, args) => {
        await upsertPendingMarketplaceImportHandler(ctx, args);
    },
});

export const resolvePendingMarketplaceImport = internalMutation({
    args: {
        userId: v.id("users"),
        marketplace: v.union(
            v.literal("Amazon"),
            v.literal("Ebay"),
            v.literal("Shopify"),
            v.literal("TikTok")
        ),
        sku: v.string(),
        orderTimestamp: v.number(),
        orderId: v.string(),
        fulfillmentTimestamp: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        await resolvePendingMarketplaceImportHandler(ctx, args);
    },
});
