"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
    generateMonthlyBatches,
    updateSyncProgress,
    handleSyncError,
    processWithProgress,
    validateSyncActive,
    finishSync,
    getIncrementalSyncStartDate,
    isInactiveSyncError,
} from "../marketplaceUtils";
import { SyncMessages } from "../syncMessages";
import {
    fetchShopifyOrderFinancials,
    type ShopifyOrderFinancials,
} from "./shopifyql";

type SyncResult =
    | { success: boolean; ordersProcessed: number }
    | { success: false; canceled: true };

/**
 * Sync Shopify orders within a date range
 * If date range spans more than 30 days, uses monthly batching
 */
export const syncShopifyOrders = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            // Get Shopify connection from database
            const connection = await ctx.runQuery(
                internal.shopifyMutations.getShopifyConnection,
                {
                    userId: args.userId,
                }
            );

            if (!connection) {
                throw new Error(
                    "No Shopify connection found. Please connect your Shopify store first."
                );
            }

            const { shop, accessToken } = connection;

            // Determine date range
            const endDateObj = args.endDate
                ? new Date(args.endDate)
                : new Date();
            const startDateObj = args.startDate
                ? new Date(args.startDate)
                : await getIncrementalSyncStartDate(
                      ctx,
                      args.userId,
                      "shopify"
                  );

            // Use monthly batching if date range is more than 30 days
            const daysDiff =
                (endDateObj.getTime() - startDateObj.getTime()) /
                (1000 * 60 * 60 * 24);
            const useBatching = daysDiff > 30;

            const batches = useBatching
                ? generateMonthlyBatches(startDateObj, endDateObj)
                : [{ start: startDateObj, end: endDateObj }];

            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("shopify"),
                undefined
            );

            const financialsByOrder = new Map<
                string,
                ShopifyOrderFinancials
            >();

            // Fetch structured order financials for each batch.
            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                await validateSyncActive(ctx, args.syncId);

                const batch = batches[batchIndex];
                const batchStartDate = batch.start.toISOString().split("T")[0];
                const batchEndDate = batch.end.toISOString().split("T")[0];

                if (useBatching) {
                    await updateSyncProgress(
                        ctx,
                        args.syncId,
                        SyncMessages.fetchingBatch(
                            "shopify",
                            batchIndex + 1,
                            batches.length
                        ),
                        undefined
                    );
                }

                const financials = await fetchShopifyOrderFinancials({
                    shop,
                    accessToken,
                    startDate: batchStartDate,
                    endDate: batchEndDate,
                });
                for (const orderFinancials of financials) {
                    financialsByOrder.set(
                        orderFinancials.orderId,
                        orderFinancials
                    );
                }

                // Small delay between batches to avoid rate limiting
                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            const uniqueOrders = [...financialsByOrder.values()].map(
                (financials) => ({
                    orderGid: `gid://shopify/Order/${financials.orderId}`,
                    financials,
                })
            );

            await processWithProgress(
                ctx,
                args.syncId,
                uniqueOrders,
                async (orderData, _i) => {
                    await ctx.runAction(
                        internal.shopify.processShopifyOrder,
                        {
                            userId: args.userId,
                            orderGid: orderData.orderGid,
                            financials: orderData.financials,
                            shop,
                            accessToken,
                            updateExisting: args.updateExisting ?? false,
                        }
                    );
                },
                "shopify"
            );

            // Validate sync exists and is active before finishing
            await validateSyncActive(ctx, args.syncId);

            await finishSync(ctx, args.syncId, "shopify");

            return { success: true, ordersProcessed: uniqueOrders.length };
        } catch (error: unknown) {
            // Don't treat cancellation or missing sync as an error - it's expected
            if (isInactiveSyncError(error)) {
                return { success: false, canceled: true };
            }
            // Only handle error if sync still exists
            const syncExists = await ctx.runQuery(
                internal.products.getSyncById,
                { syncId: args.syncId }
            );
            if (syncExists) {
                await handleSyncError(ctx, args.syncId, error, "shopify");
            }
            throw error;
        }
    },
});

/**
 * Sync Shopify orders for the past year
 */
export const syncShopifyOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<SyncResult> => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        const result = await ctx.runAction(internal.shopify.syncShopifyOrders, {
            userId: args.userId,
            syncId: args.syncId,
            startDate: startDate.toISOString().split("T")[0],
            endDate: endDate.toISOString().split("T")[0],
            updateExisting: args.updateExisting ?? false,
        });
        return result as SyncResult;
    },
});
