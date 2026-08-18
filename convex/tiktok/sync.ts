"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
    updateSyncProgress,
    handleSyncError,
    processWithProgress,
    validateSyncActive,
    finishSync,
    isInactiveSyncError,
} from "../marketplaceUtils";
import { SyncMessages } from "../syncMessages";
import { getTiktokApiContext, searchTiktokOrders } from "./client";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function generateThirtyDayBatches(
    startDate: Date,
    endDate: Date
): Array<{ start: Date; end: Date }> {
    const batches: Array<{ start: Date; end: Date }> = [];
    let current = startDate.getTime();
    const endMs = endDate.getTime();

    while (current < endMs) {
        const batchEnd = Math.min(current + THIRTY_DAYS_MS, endMs);
        batches.push({
            start: new Date(current),
            end: new Date(batchEnd),
        });
        current = batchEnd;
    }

    return batches;
}

type SyncResult =
    | { success: boolean; ordersProcessed: number }
    | { success: false; canceled: true };

export const syncTiktokOrders = internalAction({
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

            const api = await getTiktokApiContext(ctx, args.userId);

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
            const batches = useBatching
                ? generateThirtyDayBatches(startDateObj, endDateObj)
                : [{ start: startDateObj, end: endDateObj }];

            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("tiktok")
            );

            const orderIds: string[] = [];

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                await validateSyncActive(ctx, args.syncId);
                const batch = batches[batchIndex];

                if (useBatching) {
                    await updateSyncProgress(
                        ctx,
                        args.syncId,
                        SyncMessages.fetchingBatch(
                            "tiktok",
                            batchIndex + 1,
                            batches.length
                        ),
                        { current: batchIndex, total: batches.length }
                    );
                }

                let pageToken: string | undefined;
                do {
                    const page = await searchTiktokOrders({
                        accessToken: api.accessToken,
                        shopCipher: api.shopCipher,
                        createTimeGe: Math.floor(batch.start.getTime() / 1000),
                        createTimeLt: Math.floor(batch.end.getTime() / 1000),
                        pageToken,
                    });
                    orderIds.push(...page.orderIds);
                    pageToken = page.nextPageToken;
                } while (pageToken);

                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            const uniqueOrderIds = [...new Set(orderIds)];
            let processedCount = 0;

            await processWithProgress(
                ctx,
                args.syncId,
                uniqueOrderIds,
                async (orderId: string) => {
                    try {
                        await ctx.runAction(internal.tiktok.processTiktokOrder, {
                            userId: args.userId,
                            orderId,
                            accessToken: api.accessToken,
                            shopCipher: api.shopCipher,
                            updateExisting: args.updateExisting ?? false,
                        });
                        processedCount++;
                    } catch (error) {
                        console.error(
                            `Error processing TikTok order ${orderId}:`,
                            error
                        );
                    }
                },
                "tiktok"
            );

            await validateSyncActive(ctx, args.syncId);
            await finishSync(ctx, args.syncId, "tiktok");

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
                await handleSyncError(ctx, args.syncId, error, "tiktok");
            }
            throw error;
        }
    },
});

export const syncTiktokOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<SyncResult> => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        return await ctx.runAction(internal.tiktok.syncTiktokOrders, {
            userId: args.userId,
            syncId: args.syncId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            updateExisting: args.updateExisting ?? false,
        });
    },
});
