"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
    validateSyncActive,
    handleSyncError,
    finishSync,
    getErrorMessage,
} from "./marketplaceUtils";
import { Id } from "./_generated/dataModel";
import { productMarketplaceValidator } from "./lib/validators";
import { getTiktokApiContext } from "./tiktok/client";
import { shopifyQlDateWindow } from "./shopify/shopifyql";

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

        const dateWindow = shopifyQlDateWindow(args.orderDate);
        const financials = await ctx.runAction(
            internal.shopify.getShopifyOrderFinancials,
            {
                orderIds: [orderGid],
                shop: connection.shop,
                accessToken: connection.accessToken,
                startDate: dateWindow.startDate,
                endDate: dateWindow.endDate,
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
                    console.error(
                        JSON.stringify({
                            operation: "resync_all_orders",
                            orderId: order.orderId,
                            marketplace: order.marketplace,
                            error: getErrorMessage(error),
                            timestamp: new Date().toISOString(),
                        })
                    );
                }

                totalProcessed++;

                await ctx.runMutation(internal.products.updateSyncProgress, {
                    syncId: args.syncId,
                    message: `Resyncing ${order.marketplace} orders... (${totalProcessed}/${totalOrders})`,
                    total: totalOrders,
                    complete: totalProcessed,
                });
            }

            await finishSync(
                ctx,
                args.syncId,
                "amazon",
                `Resync complete: ${totalProcessed} of ${totalOrders} orders processed`
            );
            return {
                message: `Resync complete: ${totalProcessed} of ${totalOrders} orders processed`,
                totalProcessed,
                totalOrders,
            };
        } catch (error: unknown) {
            await handleSyncError(ctx, args.syncId, error, "amazon");
            throw error;
        }
    },
});
