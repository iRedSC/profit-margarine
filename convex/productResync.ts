"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { hasFulfillmentOrderScope } from "./shopify/graphql";
import {
    validateSyncActive,
    handleSyncError,
    finishSync,
    getErrorMessage,
    isInactiveSyncError,
    processWithProgress,
} from "./marketplaceUtils";
import { Id } from "./_generated/dataModel";
import {
    productMarketplaceValidator,
    syncMarketplaceValidator,
} from "./lib/validators";
import { getTiktokApiContext } from "./tiktok/client";
import { cleanErrorMessage } from "./lib/errorText";

async function processOrderByMarketplace(
    ctx: ActionCtx,
    args: {
        userId: Id<"users">;
        marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
        orderId: string;
        orderDate?: number;
        retrySource?: string;
    }
) {
    if (args.marketplace === "Amazon") {
        return await ctx.runAction(internal.amazon.processAmazonOrder, {
            userId: args.userId,
            orderId: args.orderId,
            updateExisting: true,
            ...(args.retrySource ? { retrySource: args.retrySource } : {}),
        });
    }

    if (args.marketplace === "Ebay") {
        const accessToken = await ctx.runAction(
            internal.ebay.getEbayAccessTokenForResync,
            { userId: args.userId }
        );

        const [shippingData, transactions] = await Promise.all([
            ctx.runAction(internal.ebay.getShippingCostForOrder, {
                orderId: args.orderId,
                accessToken,
                orderDate: args.orderDate,
            }),
            ctx.runAction(internal.ebay.getTransactionsForOrder, {
                orderId: args.orderId,
                accessToken,
                orderDate: args.orderDate,
            }),
        ]);

        return await ctx.runAction(internal.ebay.processEbayOrder, {
            userId: args.userId,
            orderId: args.orderId,
            shippingCost: shippingData.shipping,
            accessToken,
            allTransactions: transactions,
            updateExisting: true,
        });
    }

    if (args.marketplace === "Shopify") {
        const connection = await ctx.runQuery(
            internal.shopifyMutations.getShopifyConnection,
            { userId: args.userId }
        );

        if (!connection) {
            throw new Error(
                "No Shopify connection found. Please connect your Shopify store first."
            );
        }

        const orderGid =
            args.orderId.startsWith("gid://") || args.orderId.startsWith("gid:")
                ? args.orderId
                : `gid://shopify/Order/${args.orderId}`;

        const financials = await ctx.runAction(
            internal.shopify.getShopifyOrderFinancials,
            {
                orderIds: [orderGid],
                shop: connection.shop,
                accessToken: connection.accessToken,
                orderDate: args.orderDate,
            }
        );
        const orderFinancials = financials[0];
        if (!orderFinancials) {
            throw new Error(
                `ShopifyQL returned no financial data for order ${args.orderId}`
            );
        }

        return await ctx.runAction(internal.shopify.processShopifyOrder, {
            userId: args.userId,
            orderGid,
            financials: orderFinancials,
            shop: connection.shop,
            accessToken: connection.accessToken,
            includeFulfillmentOrders: hasFulfillmentOrderScope(
                connection.scopes?.split(/[\s,]+/) ?? []
            ),
            updateExisting: true,
        });
    }

    if (args.marketplace === "TikTok") {
        const api = await getTiktokApiContext(ctx, args.userId);
        return await ctx.runAction(internal.tiktok.processTiktokOrder, {
            userId: args.userId,
            orderId: args.orderId,
            accessToken: api.accessToken,
            shopCipher: api.shopCipher,
            updateExisting: true,
        });
    }

    throw new Error("Unsupported marketplace");
}

export const resyncOrderAction = internalAction({
    args: {
        userId: v.id("users"),
        marketplaceProductId: v.id("marketplaceProducts"),
        marketplace: productMarketplaceValidator,
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const mp = await ctx.runQuery(
                internal.products.getMarketplaceProduct,
                { marketplaceProductId: args.marketplaceProductId }
            );

            if (!mp) {
                throw new Error("Marketplace product not found");
            }

            await processOrderByMarketplace(ctx, {
                userId: args.userId,
                marketplace: args.marketplace,
                orderId: args.orderId,
                orderDate: mp.orderDate,
            });

            return { success: true };
        } catch (error: unknown) {
            console.error(
                JSON.stringify({
                    operation: "resync_order",
                    orderId: args.orderId,
                    marketplace: args.marketplace,
                    error: getErrorMessage(error),
                    timestamp: new Date().toISOString(),
                })
            );
            throw error;
        }
    },
});

export const syncOrderByIdAction = internalAction({
    args: {
        userId: v.id("users"),
        marketplace: productMarketplaceValidator,
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            console.error(
                JSON.stringify({
                    operation: "sync_order_by_id_action_start",
                    orderId: args.orderId,
                    marketplace: args.marketplace,
                    userId: args.userId,
                    timestamp: new Date().toISOString(),
                })
            );

            let beforeState;
            if (args.marketplace === "Amazon") {
                beforeState = await ctx.runQuery(
                    internal.products.getAmazonOrderImportSummaryByOrderId,
                    { userId: args.userId, orderId: args.orderId }
                );
            }

            const result = await processOrderByMarketplace(ctx, {
                userId: args.userId,
                marketplace: args.marketplace,
                orderId: args.orderId,
                retrySource:
                    args.marketplace === "Amazon"
                        ? "manual_sync_order_by_id"
                        : undefined,
            });

            if (args.marketplace === "Amazon") {
                const afterState = await ctx.runQuery(
                    internal.products.getAmazonOrderImportSummaryByOrderId,
                    { userId: args.userId, orderId: args.orderId }
                );
                console.error(
                    JSON.stringify({
                        operation: "sync_order_by_id_action_result",
                        orderId: args.orderId,
                        marketplace: args.marketplace,
                        userId: args.userId,
                        timestamp: new Date().toISOString(),
                        beforeState,
                        result,
                        afterState,
                    })
                );
            }

            return { success: true };
        } catch (error: unknown) {
            console.error(
                JSON.stringify({
                    operation: "sync_order_by_id",
                    orderId: args.orderId,
                    marketplace: args.marketplace,
                    error: getErrorMessage(error),
                    timestamp: new Date().toISOString(),
                })
            );
            throw error;
        }
    },
});

export const resyncAllOrdersAction = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
    },
    handler: async (
        ctx,
        args
    ): Promise<{
        message: string;
        totalProcessed?: number;
        totalOrders?: number;
    }> => {
        try {
            await validateSyncActive(ctx, args.syncId);

            const ordersToResync: Array<{
                marketplaceProductId: Id<"marketplaceProducts">;
                marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
                orderId: string;
            }> = await ctx.runQuery(
                internal.products.getAllMarketplaceProductsWithOrders,
                { userId: args.userId }
            );

            if (ordersToResync.length === 0) {
                await finishSync(
                    ctx,
                    args.syncId,
                    "amazon",
                    "Resync complete: No orders to resync"
                );
                return { message: "No orders to resync" };
            }

            const totalOrders = ordersToResync.length;

            await ctx.runMutation(internal.products.updateSyncProgress, {
                syncId: args.syncId,
                message: `Resyncing ${totalOrders} orders from existing marketplace products...`,
                total: totalOrders,
                complete: 0,
            });

            let totalProcessed = 0;
            let failed = 0;

            for (const order of ordersToResync) {
                await validateSyncActive(ctx, args.syncId);

                await ctx.runMutation(internal.products.updateSyncProgress, {
                    syncId: args.syncId,
                    message: `Resyncing ${order.marketplace} orders... (${totalProcessed + 1}/${totalOrders})`,
                    total: totalOrders,
                    complete: totalProcessed,
                });

                try {
                    await ctx.runAction(
                        internal.productResync.resyncOrderAction,
                        {
                            userId: args.userId,
                            marketplaceProductId: order.marketplaceProductId,
                            marketplace: order.marketplace,
                            orderId: order.orderId,
                        }
                    );
                } catch (error: unknown) {
                    if (isInactiveSyncError(error)) throw error;
                    failed += 1;
                    console.error(
                        JSON.stringify({
                            operation: "resync_all_orders",
                            orderId: order.orderId,
                            marketplace: order.marketplace,
                            error: getErrorMessage(error),
                            timestamp: new Date().toISOString(),
                        })
                    );
                    await ctx.runMutation(internal.diagnostics.recordSyncIssue, {
                        syncId: args.syncId,
                        severity: "error",
                        orderId: order.orderId,
                        message: `${order.marketplace}: ${cleanErrorMessage(error)}`,
                    });
                }

                totalProcessed++;

                await ctx.runMutation(internal.products.updateSyncProgress, {
                    syncId: args.syncId,
                    message: `Resyncing ${order.marketplace} orders... (${totalProcessed}/${totalOrders})`,
                    total: totalOrders,
                    complete: totalProcessed,
                });
            }

            const succeeded = totalProcessed - failed;
            const message =
                failed === 0
                    ? `Resync complete: ${totalOrders} orders resynced`
                    : `Resync finished: ${failed} of ${totalOrders} orders failed, see Diagnostics`;
            if (failed > 0 && succeeded === 0) {
                await ctx.runMutation(internal.products.failSync, {
                    syncId: args.syncId,
                    error: message,
                    message,
                });
            } else {
                await finishSync(ctx, args.syncId, "amazon", message);
            }
            return { message, totalProcessed: succeeded, totalOrders };
        } catch (error: unknown) {
            await handleSyncError(ctx, args.syncId, error, "amazon");
            throw error;
        }
    },
});

const PRODUCT_MARKETPLACE = {
    amazon: "Amazon",
    ebay: "Ebay",
    shopify: "Shopify",
    tiktok: "TikTok",
} as const;

const DISCOVERY_ACTIONS = {
    amazon: internal.amazon.syncAmazonOrders,
    ebay: internal.ebay.syncEbayOrders,
    shopify: internal.shopify.syncShopifyOrders,
    tiktok: internal.tiktok.syncTiktokOrders,
} as const;

/**
 * Scheduled sync, step 1: re-fetch only the recent orders still missing real
 * fees or label costs (see lib/costCompleteness.ts). Step 2 hands the same
 * sync record to the normal incremental sync, which imports new orders and
 * skips ones already stored.
 */
export const refreshIncompleteOrdersAction = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        marketplace: syncMarketplaceValidator,
    },
    handler: async (ctx, args) => {
        const marketplace = PRODUCT_MARKETPLACE[args.marketplace];
        try {
            await validateSyncActive(ctx, args.syncId);
            const now = Date.now();
            const orders = await ctx.runQuery(
                internal.costRefresh.getOrdersDueForCostRefresh,
                { userId: args.userId, marketplace, now }
            );

            if (orders.length > 0) {
                await processWithProgress({
                    ctx,
                    syncId: args.syncId,
                    marketplace: args.marketplace,
                    items: orders,
                    orderIdOf: (order) => order.orderId,
                    progressMessage: `Checking ${orders.length} orders for final fees and labels...`,
                    processor: async (order) => {
                        await validateSyncActive(ctx, args.syncId);
                        try {
                            await processOrderByMarketplace(ctx, {
                                userId: args.userId,
                                marketplace,
                                orderId: order.orderId,
                                orderDate: order.orderDate,
                            });
                        } finally {
                            // Back off even when the marketplace errors, so one
                            // bad order can't eat every run's budget.
                            await ctx.runMutation(
                                internal.costRefresh.markCostsChecked,
                                {
                                    userId: args.userId,
                                    marketplace,
                                    orderId: order.orderId,
                                    checkedAt: now,
                                }
                            );
                        }
                    },
                });
            }

            await ctx.scheduler.runAfter(
                0,
                DISCOVERY_ACTIONS[args.marketplace],
                {
                    userId: args.userId,
                    syncId: args.syncId,
                    updateExisting: false,
                }
            );
        } catch (error: unknown) {
            if (isInactiveSyncError(error)) return;
            await handleSyncError(ctx, args.syncId, error, args.marketplace);
        }
    },
});
