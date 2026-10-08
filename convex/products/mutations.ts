import { type Infer, ObjectType, v } from "convex/values";
import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { requireUserId } from "../lib/auth";
import {
    breakdownValidator,
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
                isFBA: args.isFBA,
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
        isFBA: args.isFBA,
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

const orderLineValidator = v.object({
    sku: v.string(),
    name: v.string(),
    quantity: v.number(),
    // Per-unit amounts; each unit becomes one marketplaceProducts row.
    price: v.number(),
    fees: v.number(),
    fees_breakdown: v.optional(breakdownValidator),
    shipping: v.number(),
    shipping_breakdown: v.optional(breakdownValidator),
    shippingPercentage: v.optional(v.number()),
    buyerPaidShipping: v.optional(v.number()),
    tiktokFinanceStatus: v.optional(tiktokFinanceStatusValidator),
    shippingEstimated: v.optional(v.boolean()),
    isPickup: v.optional(v.boolean()),
    isFBA: v.optional(v.boolean()),
});

export type OrderLine = Infer<typeof orderLineValidator>;

const replaceOrderRowsArgs = {
    userId: v.id("users"),
    marketplace: productMarketplaceValidator,
    orderId: v.string(),
    orderTimestamp: v.number(),
    fulfillmentTimestamp: v.optional(v.number()),
    lines: v.array(orderLineValidator),
    // SKUs whose existing rows must be left alone, e.g. Amazon lines that
    // were queued as pending imports instead of written here.
    retainSkus: v.optional(v.array(v.string())),
};

// Unfulfilled orders with no shipping cost yet aren't imported; their
// existing rows (if any) are kept until the order has real costs.
function isImportable(
    marketplace: Infer<typeof productMarketplaceValidator>,
    line: OrderLine,
    fulfillmentTimestamp: number | undefined
): boolean {
    return (
        line.shipping !== 0 ||
        fulfillmentTimestamp !== undefined ||
        marketplace === "TikTok"
    );
}

async function upsertCatalogProduct(
    ctx: MutationCtx,
    userId: Id<"users">,
    sku: string,
    name: string
): Promise<Doc<"products">> {
    const existing = await ctx.db
        .query("products")
        .withIndex("by_user_and_sku", (q) =>
            q.eq("userId", userId).eq("sku", sku)
        )
        .first();
    if (existing) {
        if (existing.name !== name) {
            await ctx.db.patch(existing._id, { name });
        }
        return existing;
    }
    const productId = await ctx.db.insert("products", { sku, name, userId });
    return (await ctx.db.get(productId))!;
}

/**
 * Make the stored rows for one order match `lines`, in one transaction.
 *
 * Each unit of quantity is one row. Rows are matched to units per SKU in
 * creation order: matched rows are updated in place (keeping their id and
 * their own cost), missing units are inserted with the catalog cost, and
 * surplus rows are deleted. Rows for SKUs no longer in the order are deleted
 * unless listed in `retainSkus`.
 *
 * A row's cost is a snapshot: the catalog cost only fills rows that have
 * none, so a resync never overwrites a cost the user set.
 */
async function replaceOrderRowsHandler(
    ctx: MutationCtx,
    args: ObjectType<typeof replaceOrderRowsArgs>
) {
    const existingRows = await ctx.db
        .query("marketplaceProducts")
        .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
        .filter((q) =>
            q.and(
                q.eq(q.field("userId"), args.userId),
                q.eq(q.field("orderDate"), args.orderTimestamp),
                q.eq(q.field("marketplace"), args.marketplace)
            )
        )
        .collect();
    existingRows.sort((a, b) => a._creationTime - b._creationTime);

    const retained = new Set(args.retainSkus ?? []);
    const unitsBySku = new Map<string, OrderLine[]>();
    for (const line of args.lines) {
        if (!isImportable(args.marketplace, line, args.fulfillmentTimestamp)) {
            retained.add(line.sku);
            continue;
        }
        const units = unitsBySku.get(line.sku) ?? [];
        for (let unit = 0; unit < line.quantity; unit++) units.push(line);
        unitsBySku.set(line.sku, units);
    }

    const rowsBySku = new Map<string, Doc<"marketplaceProducts">[]>();
    for (const row of existingRows) {
        const sku = row.sku ?? "";
        rowsBySku.set(sku, [...(rowsBySku.get(sku) ?? []), row]);
    }

    for (const [sku, rows] of rowsBySku) {
        if (unitsBySku.has(sku) || retained.has(sku)) continue;
        for (const row of rows) await ctx.db.delete(row._id);
    }

    for (const [sku, units] of unitsBySku) {
        const product = await upsertCatalogProduct(
            ctx,
            args.userId,
            sku,
            units[0].name
        );
        const rows = rowsBySku.get(sku) ?? [];

        for (let i = 0; i < units.length; i++) {
            const line = units[i];
            const fields = {
                productId: product._id,
                name: line.name,
                price: line.price,
                fees: line.fees,
                fees_breakdown: line.fees_breakdown,
                shipping: line.shipping,
                shipping_breakdown: line.shipping_breakdown,
                shippingPercentage: line.shippingPercentage,
                buyerPaidShipping: line.buyerPaidShipping,
                tiktokFinanceStatus: line.tiktokFinanceStatus,
                shippingEstimated: line.shippingEstimated,
                isPickup: line.isPickup,
                isFBA: line.isFBA,
                fulfillmentDate: args.fulfillmentTimestamp,
            };
            const row = rows[i];
            if (row) {
                await ctx.db.patch(row._id, {
                    ...fields,
                    cost: row.cost ?? product.cost,
                });
            } else {
                await ctx.db.insert("marketplaceProducts", {
                    ...fields,
                    cost: product.cost,
                    marketplace: args.marketplace,
                    orderDate: args.orderTimestamp,
                    orderId: args.orderId,
                    sku,
                    userId: args.userId,
                });
            }
        }
        for (const row of rows.slice(units.length)) {
            await ctx.db.delete(row._id);
        }

        if (args.marketplace === "Amazon" && args.fulfillmentTimestamp) {
            await resolvePendingMarketplaceImportHandler(ctx, {
                userId: args.userId,
                marketplace: args.marketplace,
                sku,
                orderTimestamp: args.orderTimestamp,
                orderId: args.orderId,
                fulfillmentTimestamp: args.fulfillmentTimestamp,
            });
        }
    }
}

export const replaceOrderRows = internalMutation({
    args: replaceOrderRowsArgs,
    handler: replaceOrderRowsHandler,
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
