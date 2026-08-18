import { ObjectType, v } from "convex/values";
import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { requireUserId } from "../lib/auth";
import {
    marketplaceLineItemFields,
    productMarketplaceValidator,
    rawFinancialEventsStatusValidator,
    tiktokFinanceStatusValidator,
} from "../lib/validators";

export const addProduct = mutation({
    args: {
        sku: v.string(),
        name: v.string(),
        marketplace: productMarketplaceValidator,
        price: v.number(),
        cost: v.number(),
        fees: v.number(),
        shipping: v.number(),
    },
    handler: async (ctx, args) => {
        const userId = await requireUserId(ctx);

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
        const userId = await requireUserId(ctx);

        const mp = await ctx.db.get(args.marketplaceProductId);
        if (!mp || mp.userId !== userId) {
            throw new Error("Not found or unauthorized");
        }

        await ctx.db.patch(args.marketplaceProductId, { cost: args.cost });

        if (mp.productId) {
            await ctx.db.patch(mp.productId, { cost: args.cost });

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
    },
});

export const deleteMarketplaceProduct = mutation({
    args: {
        marketplaceProductId: v.id("marketplaceProducts"),
    },
    handler: async (ctx, args) => {
        const userId = await requireUserId(ctx);

        const mp = await ctx.db.get(args.marketplaceProductId);
        if (!mp || mp.userId !== userId) {
            throw new Error("Not found or unauthorized");
        }

        const productId = mp.productId;
        await ctx.db.delete(args.marketplaceProductId);

        if (productId) {
            const remaining = await ctx.db
                .query("marketplaceProducts")
                .withIndex("by_product", (q) => q.eq("productId", productId))
                .first();
            if (!remaining) {
                await ctx.db.delete(productId);
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

        const productIdsToCheck = new Set<Id<"products">>();

        for (const mp of existingMarketplaceProducts) {
            if (mp.productId) {
                productIdsToCheck.add(mp.productId);
            }
            await ctx.db.delete(mp._id);
        }

        for (const productId of productIdsToCheck) {
            const remaining = await ctx.db
                .query("marketplaceProducts")
                .withIndex("by_product", (q) => q.eq("productId", productId))
                .first();
            if (!remaining) {
                await ctx.db.delete(productId);
            }
        }
    },
});

const upsertPendingMarketplaceImportArgs = {
    userId: v.id("users"),
    marketplace: productMarketplaceValidator,
    quantity: v.number(),
    ...marketplaceLineItemFields,
    reasonCode: v.string(),
    reasonMessage: v.string(),
    rawFinancialEventsStatus: v.optional(rawFinancialEventsStatusValidator),
    lastAttemptAt: v.number(),
};

const resolvePendingMarketplaceImportArgs = {
    userId: v.id("users"),
    marketplace: productMarketplaceValidator,
    sku: v.string(),
    orderTimestamp: v.number(),
    orderId: v.string(),
    fulfillmentTimestamp: v.optional(v.number()),
};

const upsertMarketplaceProductArgs = {
    userId: v.id("users"),
    marketplace: productMarketplaceValidator,
    ...marketplaceLineItemFields,
    tiktokFinanceStatus: v.optional(tiktokFinanceStatusValidator),
    updateExisting: v.optional(v.boolean()),
};

async function upsertPendingMarketplaceImportHandler(
    ctx: MutationCtx,
    args: ObjectType<typeof upsertPendingMarketplaceImportArgs>
) {
    const existingPendingImports = await ctx.db
        .query("pendingMarketplaceImports")
        .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
        .filter((q) =>
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
    ctx: MutationCtx,
    args: ObjectType<typeof resolvePendingMarketplaceImportArgs>
) {
    const existingPendingImports = await ctx.db
        .query("pendingMarketplaceImports")
        .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
        .filter((q) =>
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

async function upsertMarketplaceProductHandler(
    ctx: MutationCtx,
    args: ObjectType<typeof upsertMarketplaceProductArgs>
) {
    if (
        args.shipping === 0 &&
        !args.fulfillmentTimestamp &&
        args.marketplace !== "TikTok"
    ) {
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

    if (args.updateExisting && args.orderId && args.marketplace !== "Ebay") {
        const existingMarketplaceProducts = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("orderDate"), args.orderTimestamp),
                    q.eq(q.field("sku"), args.sku),
                    q.eq(q.field("marketplace"), args.marketplace)
                )
            )
            .collect();

        if (existingMarketplaceProducts.length > 0) {
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
                    tiktokFinanceStatus: args.tiktokFinanceStatus,
                    fulfillmentDate: args.fulfillmentTimestamp,
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
        tiktokFinanceStatus: args.tiktokFinanceStatus,
        orderDate: args.orderTimestamp,
        fulfillmentDate: args.fulfillmentTimestamp,
        userId: args.userId,
        orderId: args.orderId,
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

export const upsertMarketplaceProduct = internalMutation({
    args: upsertMarketplaceProductArgs,
    handler: async (ctx, args) => {
        await upsertMarketplaceProductHandler(ctx, args);
    },
});

export const upsertPendingMarketplaceImport = internalMutation({
    args: upsertPendingMarketplaceImportArgs,
    handler: async (ctx, args) => {
        await upsertPendingMarketplaceImportHandler(ctx, args);
    },
});

export const resolvePendingMarketplaceImport = internalMutation({
    args: resolvePendingMarketplaceImportArgs,
    handler: async (ctx, args) => {
        await resolvePendingMarketplaceImportHandler(ctx, args);
    },
});
