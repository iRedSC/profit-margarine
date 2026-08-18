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
    getEbayAccessToken,
    parseEbayAmount,
    readEbayTransactionsPage,
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
                : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

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

                const transactionsUrl = new URL(
                    `${baseUrl}/sell/finances/v1/transaction`
                );
                transactionsUrl.searchParams.set("limit", "200");
                transactionsUrl.searchParams.set("offset", "0");

                const batchStartDate = batch.start.toISOString();
                const filter = useEndBound
                    ? `transactionDate:[${batchStartDate}..${batch.end.toISOString()}]`
                    : `transactionDate:[${batchStartDate}..]`;
                transactionsUrl.searchParams.set("filter", filter);

                const transactionsResponse = await fetch(
                    transactionsUrl.toString(),
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                    }
                );

                if (!transactionsResponse.ok) {
                    throw new Error(
                        `Failed to fetch eBay transactions: ${transactionsResponse.status}`
                    );
                }

                const transactionsData: unknown =
                    await transactionsResponse.json();
                const { transactions } =
                    readEbayTransactionsPage(transactionsData);
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

            let processedCount = 0;
            const orderIdsArray = Array.from(orderIds);

            await processWithProgress(
                ctx,
                args.syncId,
                orderIdsArray,
                async (orderId: string, _i: number) => {
                    try {
                        await ctx.runAction(internal.ebay.processEbayOrder, {
                            userId: args.userId,
                            orderId,
                            shippingCost: shippingCostsByOrder[orderId] || 0,
                            accessToken,
                            allTransactions,
                            updateExisting: args.updateExisting ?? false,
                        });
                        processedCount++;
                    } catch (error) {
                        console.error(
                            `Error processing eBay order ${orderId}:`,
                            error
                        );
                    }
                },
                "ebay"
            );

            await validateSyncActive(ctx, args.syncId);
            await finishSync(ctx, args.syncId, "ebay");

            return { success: true, ordersProcessed: processedCount };
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
