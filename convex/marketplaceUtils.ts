"use node";

import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { MarketplaceType } from "./marketplaceConnections";
import { SyncMessages } from "./syncMessages";
import {
    runWithConcurrency,
    shouldReportProgress,
} from "./lib/concurrency";
import { getIncrementalSyncStart } from "./lib/syncWindow";

const ORDER_CONCURRENCY: Record<MarketplaceType, number> = {
    amazon: 3,
    ebay: 3,
    shopify: 3,
    tiktok: 3,
};
const PROGRESS_INTERVAL = 10;
const DEFAULT_SYNC_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const SYNC_OVERLAP_MS = 24 * 60 * 60 * 1000;

/**
 * Generate monthly date ranges for batch processing
 * Used by all marketplace sync functions
 */
export function generateMonthlyBatches(
    startDate: Date,
    endDate: Date
): Array<{ start: Date; end: Date }> {
    const batches: Array<{ start: Date; end: Date }> = [];
    let current = new Date(startDate);

    while (current < endDate) {
        const batchStart = new Date(current);
        const batchEnd = new Date(current);
        batchEnd.setMonth(batchEnd.getMonth() + 1);

        // Don't go past the end date
        if (batchEnd > endDate) {
            batchEnd.setTime(endDate.getTime());
        }

        batches.push({ start: batchStart, end: batchEnd });
        current = new Date(batchEnd);
    }

    return batches;
}

type MarketplaceProgress = {
    current: number;
    total: number;
};

export async function getIncrementalSyncStartDate(
    ctx: ActionCtx,
    userId: Id<"users">,
    marketplace: MarketplaceType
): Promise<Date> {
    const previousSyncStartedAt = await ctx.runQuery(
        internal.products.getLatestSuccessfulSyncStartedAt,
        { userId, marketplace }
    );
    return new Date(
        getIncrementalSyncStart({
            now: Date.now(),
            defaultLookbackMs: DEFAULT_SYNC_LOOKBACK_MS,
            overlapMs: SYNC_OVERLAP_MS,
            previousSyncStartedAt: previousSyncStartedAt ?? undefined,
        })
    );
}

export function getErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        const { message } = error;
        if (typeof message === "string" && message) {
            return message;
        }
    }
    return String(error);
}

export function isInactiveSyncError(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("message" in error)) {
        return false;
    }
    const { message } = error;
    return (
        message === "Sync was canceled" ||
        message === "Sync does not exist" ||
        (typeof message === "string" && message.includes("Sync is not active"))
    );
}

/**
 * Finish a sync successfully
 */
export async function finishSync(
    ctx: ActionCtx,
    syncId: Id<"syncs">,
    marketplace?: MarketplaceType,
    message?: string
): Promise<void> {
    const syncMessage = message || SyncMessages.complete(marketplace);
    await ctx.runMutation(internal.products.finishSync, {
        syncId,
        message: syncMessage,
    });
}

/**
 * Mark sync as failed
 */
async function failSync(
    ctx: ActionCtx,
    syncId: Id<"syncs">,
    error: string,
    marketplace?: MarketplaceType
): Promise<void> {
    const message = marketplace
        ? SyncMessages.failed(marketplace, error)
        : `Sync failed: ${error}`;

    await ctx.runMutation(internal.products.failSync, {
        syncId,
        error,
        message,
    });
}

/**
 * Check if a sync has been canceled or doesn't exist
 * Throws an error if sync doesn't exist or is not active
 */
export async function validateSyncActive(
    ctx: ActionCtx,
    syncId: Id<"syncs">
): Promise<void> {
    const sync = await ctx.runQuery(internal.products.getSyncById, { syncId });
    if (!sync) {
        throw new Error("Sync does not exist");
    }
    if (sync.status !== "active") {
        throw new Error(`Sync is not active (status: ${sync.status})`);
    }
}

/**
 * Update sync progress
 */
export async function updateSyncProgress(
    ctx: ActionCtx,
    syncId: Id<"syncs">,
    message: string,
    progress?: MarketplaceProgress
) {
    // Validate sync exists and is active before updating
    await validateSyncActive(ctx, syncId);

    await ctx.runMutation(internal.products.updateSyncProgress, {
        syncId,
        message,
        total: progress?.total,
        complete: progress?.current,
    });
}

/**
 * Handle sync error with proper cleanup
 */
export async function handleSyncError(
    ctx: ActionCtx,
    syncId: Id<"syncs">,
    error: unknown,
    marketplace: MarketplaceType
): Promise<void> {
    const marketplaceName =
        marketplace.charAt(0).toUpperCase() + marketplace.slice(1);
    const message = getErrorMessage(error);
    const log = {
        operation: "sync_orders",
        marketplace: marketplaceName,
        syncId: syncId.toString(),
        error: message,
        timestamp: new Date().toISOString(),
    };
    console.error(JSON.stringify(log));

    await failSync(ctx, syncId, message, marketplace);

    throw error;
}

/**
 * Process items with progress tracking
 */
export async function processWithProgress<T>(
    ctx: ActionCtx,
    syncId: Id<"syncs">,
    items: T[],
    processor: (item: T, index: number) => Promise<void>,
    marketplace: MarketplaceType,
    progressMessage?: string
) {
    const message = progressMessage || SyncMessages.processing(marketplace);

    await updateSyncProgress(ctx, syncId, message, {
        current: 0,
        total: items.length,
    });

    let completed = 0;
    let pendingProgressUpdate = Promise.resolve();

    await runWithConcurrency({
        items,
        concurrency: ORDER_CONCURRENCY[marketplace],
        process: async (item, index) => {
            await pendingProgressUpdate;
            await processor(item, index);
            completed += 1;

            if (
                !shouldReportProgress({
                    completed,
                    total: items.length,
                    interval: PROGRESS_INTERVAL,
                })
            ) {
                return;
            }

            const current = completed;
            pendingProgressUpdate = pendingProgressUpdate.then(() =>
                updateSyncProgress(ctx, syncId, message, {
                    current,
                    total: items.length,
                })
            );
            await pendingProgressUpdate;
        },
    });
}
