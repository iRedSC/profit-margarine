import { v } from "convex/values";
import { query, internalQuery, type QueryCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Doc, Id } from "../_generated/dataModel";
import { AMAZON_ESTIMATED_FEE_LABEL } from "../lib/orderCosts";
import { syncMarketplaceValidator } from "../lib/validators";

type MarketplaceProductDoc = Doc<"marketplaceProducts">;
type ProductDoc = Doc<"products">;
type PendingImportDoc = Doc<"pendingMarketplaceImports">;

function resolveOrderId(mp: {
    orderId?: string;
    OrderId?: string;
}): string | undefined {
    return mp.orderId || (mp as { OrderId?: string }).OrderId;
}

function mapMarketplaceProductRow(
    mp: MarketplaceProductDoc,
    product?: ProductDoc
) {
    return {
        _id: mp._id,
        productId: product?._id,
        sku: product?.sku ?? mp.sku ?? "Unknown",
        name: product?.name ?? mp.name ?? "Unknown Product",
        cost: mp.cost !== undefined ? mp.cost : product?.cost,
        marketplace: mp.marketplace,
        price: mp.price,
        fees: mp.fees,
        fees_breakdown: mp.fees_breakdown,
        shipping: mp.shipping,
        shipping_breakdown: mp.shipping_breakdown,
        shippingPercentage: mp.shippingPercentage,
        buyerPaidShipping: mp.buyerPaidShipping,
        ...(mp.tiktokFinanceStatus
            ? { tiktokFinanceStatus: mp.tiktokFinanceStatus }
            : {}),
        ...(mp.shippingEstimated
            ? { shippingEstimated: true }
            : {}),
        orderDate: mp.orderDate,
        fulfillmentDate: mp.fulfillmentDate,
        orderId: resolveOrderId(mp),
    };
}

async function collectIncompleteAmazonOrderContext(
    ctx: QueryCtx,
    userId: Id<"users">
): Promise<{
    pendingImports: PendingImportDoc[];
    incompleteAmazonProducts: MarketplaceProductDoc[];
}> {
    const pendingImports = await ctx.db
        .query("pendingMarketplaceImports")
        .withIndex("by_user_marketplace_status", (q) =>
            q
                .eq("userId", userId)
                .eq("marketplace", "Amazon")
                .eq("status", "pending")
        )
        .collect();

    const allMarketplaceProducts = await ctx.db
        .query("marketplaceProducts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

    const incompleteAmazonProducts = allMarketplaceProducts.filter(
        (product) =>
            product.marketplace === "Amazon" &&
            !product.fulfillmentDate &&
            !!resolveOrderId(product)
    );

    return { pendingImports, incompleteAmazonProducts };
}

export const listProductCosts = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return [];
        }

        const catalogProducts = await ctx.db
            .query("products")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        return catalogProducts
            .map((product) => ({
                sku: product.sku,
                name: product.name,
                cost: product.cost,
            }))
            .sort((a, b) => a.sku.localeCompare(b.sku));
    },
});

export const listProducts = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return [];
        }

        const allMarketplaceProducts = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect();

        const visible = allMarketplaceProducts.filter(
            (mp) => !(mp.marketplace === "Amazon" && !mp.fulfillmentDate)
        );

        const productIds = [
            ...new Set(
                visible
                    .map((mp) => mp.productId)
                    .filter((id): id is Id<"products"> => !!id)
            ),
        ];
        const products = await Promise.all(
            productIds.map((id) => ctx.db.get(id))
        );
        const productById = new Map<Id<"products">, ProductDoc>();
        for (const product of products) {
            if (product && product.userId === userId) {
                productById.set(product._id, product);
            }
        }

        const result = [];
        for (const mp of visible) {
            if (!mp.productId) {
                result.push(mapMarketplaceProductRow(mp));
                continue;
            }

            const product = productById.get(mp.productId);
            if (!product) {
                continue;
            }
            result.push(mapMarketplaceProductRow(mp, product));
        }

        return result;
    },
});

export const listPendingMarketplaceImports = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return [];
        }

        const { pendingImports, incompleteAmazonProducts } =
            await collectIncompleteAmazonOrderContext(ctx, userId);

        const results = pendingImports.map((pendingImport) => ({
            id: `${pendingImport.orderId}:${pendingImport.sku}:${pendingImport.orderDate}:pending`,
            orderId: pendingImport.orderId,
            sku: pendingImport.sku,
            name: pendingImport.name,
            quantity: pendingImport.quantity,
            price: pendingImport.price,
            fees: pendingImport.fees,
            shipping: pendingImport.shipping,
            orderDate: pendingImport.orderDate,
            reasonCode: pendingImport.reasonCode,
            reasonMessage: pendingImport.reasonMessage,
            lastAttemptAt: pendingImport.lastAttemptAt,
            rawFinancialEventsStatus: pendingImport.rawFinancialEventsStatus,
        }));
        const existingKeys = new Set(
            pendingImports.map((pendingImport) =>
                [
                    pendingImport.orderId,
                    pendingImport.orderDate,
                    pendingImport.sku,
                    pendingImport.marketplace,
                ].join(":")
            )
        );

        for (const incompleteProduct of incompleteAmazonProducts) {
            const orderId = resolveOrderId(incompleteProduct);
            if (!orderId) {
                continue;
            }

            const sku = incompleteProduct.sku || "Unknown SKU";
            const key = [
                orderId,
                incompleteProduct.orderDate,
                sku,
                incompleteProduct.marketplace,
            ].join(":");

            if (existingKeys.has(key)) {
                continue;
            }

            const hasEstimatedFees = Boolean(
                incompleteProduct.fees_breakdown?.some(
                    (entry) => entry[0] === AMAZON_ESTIMATED_FEE_LABEL
                )
            );
            const orderAgeDays =
                (Date.now() - incompleteProduct.orderDate) /
                (24 * 60 * 60 * 1000);

            results.push({
                id: `${orderId}:${sku}:${incompleteProduct.orderDate}:marketplace`,
                orderId,
                sku,
                name: incompleteProduct.name || "Unknown Product",
                quantity: 1,
                price: incompleteProduct.price,
                shipping: incompleteProduct.shipping,
                orderDate: incompleteProduct.orderDate,
                fees: incompleteProduct.fees,
                reasonCode:
                    orderAgeDays >= 7 && hasEstimatedFees
                        ? "deferred_or_unreleased_finance"
                        : "fees_present_but_no_fulfillment_date",
                reasonMessage:
                    orderAgeDays >= 7 && hasEstimatedFees
                        ? "This older Amazon order still has no released finance data in the current v0 path and may require Finances v2024 review."
                        : "This Amazon order is hidden until finance data includes a reliable fulfillment date.",
                lastAttemptAt: incompleteProduct.orderDate,
                rawFinancialEventsStatus: undefined,
            });
        }

        return results.sort((a, b) => b.orderDate - a.orderDate);
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

export const getTiktokOrderFinanceState = internalQuery({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        orderDate: v.number(),
    },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("orderDate"), args.orderDate),
                    q.eq(q.field("marketplace"), "TikTok")
                )
            )
            .collect();

        return {
            exists: rows.length > 0,
            needsFinanceRefresh: rows.some(
                (row) => row.tiktokFinanceStatus !== "settled"
            ),
        };
    },
});

export const getAmazonOrderImportState = internalQuery({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        orderDate: v.number(),
    },
    handler: async (ctx, args) => {
        const officialRows = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("orderDate"), args.orderDate),
                    q.eq(q.field("marketplace"), "Amazon")
                )
            )
            .collect();

        const pendingRows = await ctx.db
            .query("pendingMarketplaceImports")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("orderDate"), args.orderDate),
                    q.eq(q.field("marketplace"), "Amazon"),
                    q.eq(q.field("status"), "pending")
                )
            )
            .collect();

        return {
            hasTrackedOrder:
                officialRows.length > 0 || pendingRows.length > 0,
            officialRowCount: officialRows.length,
            hasFulfilledOfficialRows: officialRows.some((row) =>
                Boolean(row.fulfillmentDate)
            ),
            pendingRowCount: pendingRows.length,
        };
    },
});

export const getAmazonOrderImportSummaryByOrderId = internalQuery({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        const officialRows = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("marketplace"), "Amazon")
                )
            )
            .collect();

        const pendingRows = await ctx.db
            .query("pendingMarketplaceImports")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("marketplace"), "Amazon"),
                    q.eq(q.field("status"), "pending")
                )
            )
            .collect();

        return {
            officialRowCount: officialRows.length,
            fulfilledOfficialRowCount: officialRows.filter((row) =>
                Boolean(row.fulfillmentDate)
            ).length,
            pendingRowCount: pendingRows.length,
            pendingReasons: Array.from(
                new Set(pendingRows.map((row) => row.reasonCode))
            ),
            pendingFinanceClassifications: Array.from(
                new Set(
                    pendingRows
                        .map(
                            (row) =>
                                row.rawFinancialEventsStatus
                                    ?.financeStatusClassification
                        )
                        .filter(Boolean)
                )
            ),
            pendingRowsSuggestingV2024Fallback: pendingRows.filter(
                (row) =>
                    row.rawFinancialEventsStatus?.suggestFinancesV2024Fallback
            ).length,
            latestPendingAttemptAt: pendingRows.reduce(
                (latest, row) => Math.max(latest, row.lastAttemptAt),
                0
            ),
        };
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

export const getLatestSuccessfulSyncStartedAt = internalQuery({
    args: {
        userId: v.id("users"),
        marketplace: syncMarketplaceValidator,
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db
            .query("syncs")
            .withIndex("by_user_marketplace_status", (q) =>
                q
                    .eq("userId", args.userId)
                    .eq("marketplace", args.marketplace)
                    .eq("status", "finished")
            )
            .order("desc")
            .filter((q) => q.eq(q.field("error"), undefined))
            .first();

        return sync?.startedAt;
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
            const orderId = resolveOrderId(mp);
            if (!orderId) continue;

            const key = `${mp.marketplace}:${orderId}`;
            if (!orderMap.has(key)) {
                orderMap.set(key, {
                    marketplaceProductId: mp._id,
                    marketplace: mp.marketplace,
                    orderId,
                });
            }
        }

        return Array.from(orderMap.values());
    },
});

export const getPendingAmazonOrdersForBackfill = internalQuery({
    args: {
        userId: v.id("users"),
        retryBefore: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { pendingImports, incompleteAmazonProducts } =
            await collectIncompleteAmazonOrderContext(ctx, args.userId);

        const orderIds = new Set<string>();
        for (const pendingImport of pendingImports) {
            if (
                args.retryBefore !== undefined &&
                pendingImport.lastAttemptAt > args.retryBefore
            ) {
                continue;
            }
            orderIds.add(pendingImport.orderId);
        }

        for (const incompleteProduct of incompleteAmazonProducts) {
            const orderId = resolveOrderId(incompleteProduct);
            if (orderId) {
                orderIds.add(orderId);
            }
        }

        return Array.from(orderIds);
    },
});

export const getPendingAmazonImportRetryDiagnostics = internalQuery({
    args: {
        userId: v.id("users"),
        retryBefore: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const { pendingImports } = await collectIncompleteAmazonOrderContext(
            ctx,
            args.userId
        );

        const blockedByCooldown: Array<{
            orderId: string;
            sku: string;
            lastAttemptAt: number;
            reasonCode: string;
        }> = [];
        const eligibleOrderIds = new Set<string>();

        for (const pendingImport of pendingImports) {
            if (
                args.retryBefore !== undefined &&
                pendingImport.lastAttemptAt > args.retryBefore
            ) {
                blockedByCooldown.push({
                    orderId: pendingImport.orderId,
                    sku: pendingImport.sku,
                    lastAttemptAt: pendingImport.lastAttemptAt,
                    reasonCode: pendingImport.reasonCode,
                });
                continue;
            }
            eligibleOrderIds.add(pendingImport.orderId);
        }

        return {
            pendingRowCount: pendingImports.length,
            eligibleOrderCount: eligibleOrderIds.size,
            blockedByCooldownCount: blockedByCooldown.length,
            blockedByCooldown: blockedByCooldown.slice(0, 10),
            rowsSuggestingV2024Fallback: pendingImports.filter(
                (pendingImport) =>
                    pendingImport.rawFinancialEventsStatus
                        ?.suggestFinancesV2024Fallback
            ).length,
            financeClassifications: Array.from(
                new Set(
                    pendingImports
                        .map(
                            (pendingImport) =>
                                pendingImport.rawFinancialEventsStatus
                                    ?.financeStatusClassification
                        )
                        .filter(Boolean)
                )
            ),
        };
    },
});
