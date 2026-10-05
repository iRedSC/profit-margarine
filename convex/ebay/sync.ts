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
    completeSync,
    getIncrementalSyncStartDate,
    isInactiveSyncError,
} from "../marketplaceUtils";
import { SyncMessages } from "../syncMessages";
import {
    collectEbayTransactionPages,
    getEbayTransactionOrderIds,
    getEbayAccessToken,
    parseEbayAmount,
    type EbayTransaction,
} from "./transactions";

type SyncResult =
    | { success: boolean; ordersProcessed: number }
    | { success: false; canceled: true };

/**
 * Sync eBay orders within a date range.
 * Defaults to the last 30 days when startDate is omitted.
 * Ranges longer than 30 days use monthly batching.
 */
export const syncEbayOrders = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<SyncResult> => {
        try {
            await validateSyncActive(ctx, args.syncId);

            const accessToken = await getEbayAccessToken(ctx, args.userId);

            const endDateObj = args.endDate
                ? new Date(args.endDate)
                : new Date();
            const startDateObj = args.startDate
                ? new Date(args.startDate)
                : await getIncrementalSyncStartDate(
                      ctx,
                      args.userId,
                      "ebay"
                  );

            const daysDiff =
                (endDateObj.getTime() - startDateObj.getTime()) /
                (1000 * 60 * 60 * 24);
            const useBatching = daysDiff > 30;
            // Bound the filter when endDate is set or batching is needed.
            // Default (no dates) preserves open-ended transactionDate:[start..] queries.
            const useEndBound = !!args.endDate || useBatching;

            const batches = useBatching
                ? generateMonthlyBatches(startDateObj, endDateObj)
                : [{ start: startDateObj, end: endDateObj }];

            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("ebay"),
                { current: 0, total: 0 }
            );

            const isSandbox = process.env.EBAY_SANDBOX === "true";
            const baseUrl = isSandbox
                ? "https://apiz.sandbox.ebay.com"
                : "https://apiz.ebay.com";

            const allTransactions: EbayTransaction[] = [];

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
                            "ebay",
                            batchIndex + 1,
                            batches.length
                        ),
                        { current: batchIndex, total: batches.length }
                    );
                }

                const batchStartDate = batch.start.toISOString();
                const filter = useEndBound
                    ? `transactionDate:[${batchStartDate}..${batch.end.toISOString()}]`
                    : `transactionDate:[${batchStartDate}..]`;
                const transactions = await collectEbayTransactionPages({
                    limit: 200,
                    fetchPage: async ({ offset, limit }) => {
                        const transactionsUrl = new URL(
                            `${baseUrl}/sell/finances/v1/transaction`
                        );
                        transactionsUrl.searchParams.set(
                            "limit",
                            limit.toString()
                        );
                        transactionsUrl.searchParams.set(
                            "offset",
                            offset.toString()
                        );
                        transactionsUrl.searchParams.set("filter", filter);

                        const response = await fetch(
                            transactionsUrl.toString(),
                            {
                                headers: {
                                    Authorization: `Bearer ${accessToken}`,
                                    "Content-Type": "application/json",
                                },
                            }
                        );
                        const text = await response.text();
                        if (!response.ok) {
                            throw new Error(
                                `eBay getTransactions failed: HTTP ${response.status} ${text.slice(0, 500)}`
                            );
                        }
                        if (!text) {
                            throw new Error(
                                `eBay getTransactions returned an empty body (HTTP ${response.status}, offset ${offset})`
                            );
                        }
                        return JSON.parse(text);
                    },
                });
                allTransactions.push(...transactions);

                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            const shippingTransactions = allTransactions.filter(
                (t) => t.transactionType === "SHIPPING_LABEL"
            );

            const orderIds = new Set<string>();
            const shippingCostsByOrder: Record<string, number> = {};

            for (const transaction of shippingTransactions) {
                if (transaction.orderId) {
                    orderIds.add(transaction.orderId);
                    // Accumulate shipping costs (don't overwrite - orders can have multiple shipping labels)
                    const shippingAmount = Math.abs(
                        parseEbayAmount(transaction.amount)
                    );
                    shippingCostsByOrder[transaction.orderId] =
                        (shippingCostsByOrder[transaction.orderId] || 0) +
                        shippingAmount;
                }
            }

            const orderIdsArray = Array.from(orderIds);
            const transactionsByOrder = new Map<string, EbayTransaction[]>();
            for (const transaction of allTransactions) {
                for (const orderId of getEbayTransactionOrderIds(transaction)) {
                    if (!orderIds.has(orderId)) continue;
                    const transactions = transactionsByOrder.get(orderId) ?? [];
                    transactions.push(transaction);
                    transactionsByOrder.set(orderId, transactions);
                }
            }

            const result = await processWithProgress({
                ctx,
                syncId: args.syncId,
                marketplace: "ebay",
                items: orderIdsArray,
                orderIdOf: (orderId) => orderId,
                processor: async (orderId) => {
                    await ctx.runAction(internal.ebay.processEbayOrder, {
                        userId: args.userId,
                        orderId,
                        shippingCost: shippingCostsByOrder[orderId] || 0,
                        accessToken,
                        allTransactions: transactionsByOrder.get(orderId) ?? [],
                        updateExisting: args.updateExisting ?? false,
                    });
                },
            });

            await completeSync(ctx, args.syncId, "ebay", result);

            return { success: true, ordersProcessed: result.succeeded };
        } catch (error: unknown) {
            if (isInactiveSyncError(error)) {
                return { success: false, canceled: true };
            }
            const syncExists = await ctx.runQuery(
                internal.products.getSyncById,
                { syncId: args.syncId }
            );
            if (syncExists) {
                await handleSyncError(ctx, args.syncId, error, "ebay");
            }
            throw error;
        }
    },
});

/**
 * Sync eBay orders for the past year (thin wrapper around syncEbayOrders)
 */
export const syncEbayOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<SyncResult> => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        const result = await ctx.runAction(internal.ebay.syncEbayOrders, {
            userId: args.userId,
            syncId: args.syncId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            updateExisting: args.updateExisting ?? false,
        });
        return result;
    },
});
