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
    isInactiveSyncError,
} from "../marketplaceUtils";
import { SyncMessages } from "../syncMessages";
import {
    AMAZON_BACKFILL_LOOKBACK_MS,
    AMAZON_PENDING_BACKFILL_RETRY_MS,
    fetchAmazonOrders,
    getSellingPartnerAPI,
    type AmazonSpApiQuery,
} from "./client";

type SyncResult =
    | { success: boolean; ordersProcessed: number }
    | { success: false; canceled: true };

export const retryPendingAmazonImports = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
    },
    handler: async (
        ctx,
        args
    ): Promise<{ success: boolean; ordersProcessed: number }> => {
        try {
            await validateSyncActive(ctx, args.syncId);
            const retryBefore =
                Date.now() - AMAZON_PENDING_BACKFILL_RETRY_MS;
            const diagnostics = await ctx.runQuery(
                internal.products.getPendingAmazonImportRetryDiagnostics,
                {
                    userId: args.userId,
                    retryBefore,
                }
            );

            const pendingOrderIds: string[] = await ctx.runQuery(
                internal.products.getPendingAmazonOrdersForBackfill,
                {
                    userId: args.userId,
                    retryBefore,
                }
            );

            console.error(
                JSON.stringify({
                    operation: "retry_pending_amazon_imports_start",
                    userId: args.userId,
                    syncId: args.syncId,
                    timestamp: new Date().toISOString(),
                    retryWindowMs: AMAZON_PENDING_BACKFILL_RETRY_MS,
                    diagnostics,
                    pendingOrderIds,
                })
            );

            if (pendingOrderIds.length === 0) {
                console.error(
                    JSON.stringify({
                        operation: "retry_pending_amazon_imports_noop",
                        userId: args.userId,
                        syncId: args.syncId,
                        timestamp: new Date().toISOString(),
                        reason:
                            diagnostics.pendingRowCount === 0
                                ? "no_pending_rows"
                                : "all_pending_rows_blocked_by_retry_window",
                        diagnostics,
                    })
                );
                await finishSync(
                    ctx,
                    args.syncId,
                    "amazon",
                    "Amazon pending import retry complete: no pending orders were eligible yet"
                );
                return { success: true, ordersProcessed: 0 };
            }

            await processWithProgress(
                ctx,
                args.syncId,
                pendingOrderIds,
                async (orderId: string) => {
                    const beforeState = await ctx.runQuery(
                        internal.products.getAmazonOrderImportSummaryByOrderId,
                        {
                            userId: args.userId,
                            orderId,
                        }
                    );
                    const result = await ctx.runAction(
                        internal.amazon.processAmazonOrder,
                        {
                            userId: args.userId,
                            orderId,
                            updateExisting: true,
                            retrySource: "pending_imports_bulk_retry",
                        }
                    );
                    const afterState = await ctx.runQuery(
                        internal.products.getAmazonOrderImportSummaryByOrderId,
                        {
                            userId: args.userId,
                            orderId,
                        }
                    );
                    console.error(
                        JSON.stringify({
                            operation: "retry_pending_amazon_import_order",
                        userId: args.userId,
                            syncId: args.syncId,
                        orderId,
                            timestamp: new Date().toISOString(),
                            beforeState,
                            result,
                            afterState,
                        })
                    );
                },
                "amazon",
                "Retrying pending Amazon imports..."
            );

            await finishSync(
                ctx,
                args.syncId,
                "amazon",
                `Amazon pending import retry complete: ${pendingOrderIds.length} orders checked`
            );

            return { success: true, ordersProcessed: pendingOrderIds.length };
        } catch (error: unknown) {
            await handleSyncError(ctx, args.syncId, error, "amazon");
            throw error;
        }
    },
});

/**
 * Sync Amazon orders within a date range.
 * Defaults to the 72-hour backfill lookback when startDate is omitted.
 * Ranges longer than 30 days use monthly batching.
 */
export const syncAmazonOrders = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            await validateSyncActive(ctx, args.syncId);

            const spApi = getSellingPartnerAPI();

            // Amazon requires LastUpdatedBefore to be at least 2 minutes before
            // current time — subtract 3 minutes for safety when bounding the range.
            const endDateObj = args.endDate
                ? new Date(args.endDate)
                : new Date(Date.now() - 3 * 60 * 1000);

            // Re-read a 72-hour window so late-arriving Amazon finance events
            // can replace initial estimates with actual fees and fulfillment dates.
            const startDateObj = args.startDate
                ? new Date(args.startDate)
                : new Date(Date.now() - AMAZON_BACKFILL_LOOKBACK_MS);

            const shouldBackfillRecentOrders = !args.startDate;
            const updateExisting =
                args.updateExisting ?? shouldBackfillRecentOrders;

            const daysDiff =
                (endDateObj.getTime() - startDateObj.getTime()) /
                (1000 * 60 * 60 * 24);
            const useBatching = daysDiff > 30;
            // Bound with LastUpdatedBefore when endDate is set or batching is needed.
            // Default (no dates) preserves open-ended LastUpdatedAfter-only queries.
            const useEndBound = !!args.endDate || useBatching;

            const batches = useBatching
                ? generateMonthlyBatches(startDateObj, endDateObj)
                : [{ start: startDateObj, end: endDateObj }];

            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("amazon"),
                { current: 0, total: 0 }
            );

            const allOrders: Array<{ AmazonOrderId: string }> = [];

            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                await validateSyncActive(ctx, args.syncId);

                const batch = batches[batchIndex];

                if (useBatching) {
                    await updateSyncProgress(
                        ctx,
                        args.syncId,
                        SyncMessages.fetchingBatch(
                            "amazon",
                            batchIndex + 1,
                            batches.length
                        ),
                        undefined
                    );
                }

                const query: AmazonSpApiQuery = {
                    MarketplaceIds: ["ATVPDKIKX0DER"], // US marketplace
                    LastUpdatedAfter: batch.start.toISOString(),
                    OrderStatuses: ["Shipped"],
                };
                if (useEndBound) {
                    query.LastUpdatedBefore = batch.end.toISOString();
                }

                const orders = await fetchAmazonOrders(spApi, query);
                allOrders.push(...orders);

                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            await processWithProgress(
                ctx,
                args.syncId,
                allOrders,
                async (order: { AmazonOrderId: string }, _i) => {
                    await ctx.runAction(internal.amazon.processAmazonOrder, {
                        userId: args.userId,
                        orderId: order.AmazonOrderId,
                        updateExisting,
                    });
                },
                "amazon"
            );

            await validateSyncActive(ctx, args.syncId);
            await finishSync(ctx, args.syncId, "amazon");

            return { success: true, ordersProcessed: allOrders.length };
        } catch (error: unknown) {
            if (isInactiveSyncError(error)) {
                return { success: false, canceled: true };
            }
            const details =
                typeof error === "object" &&
                error !== null &&
                "message" in error
                    ? error.message
                    : undefined;
            console.error("Error details:", details);
            if (
                typeof error === "object" &&
                error !== null &&
                "response" in error &&
                error.response
            ) {
                console.error(
                    "API Response:",
                    JSON.stringify(error.response, null, 2)
                );
            }
            const syncExists = await ctx.runQuery(
                internal.products.getSyncById,
                { syncId: args.syncId }
            );
            if (syncExists) {
                await handleSyncError(ctx, args.syncId, error, "amazon");
            }
            throw error;
        }
    },
});

/**
 * Sync Amazon orders for the past year (thin wrapper around syncAmazonOrders)
 */
export const syncAmazonOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<SyncResult> => {
        // Amazon requires LastUpdatedBefore ≥ 2 minutes before now
        const endDate = new Date(Date.now() - 3 * 60 * 1000);
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        const result = await ctx.runAction(internal.amazon.syncAmazonOrders, {
            userId: args.userId,
            syncId: args.syncId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            updateExisting: args.updateExisting ?? true,
        });
        return result as SyncResult;
    },
});
