"use node";

import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import type { MarketplaceType } from "./marketplaceConnections";
import { SyncMessages } from "./syncMessages";

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

/**
 * Progress tracking types for different marketplaces
 */
export type MarketplaceProgress = {
    current: number;
    total: number;
};

/**
 * Create a new sync record for a marketplace
 */
export async function createSync(
    ctx: any,
    userId: Id<"users">,
    marketplace: MarketplaceType,
    message?: string
): Promise<Id<"syncs">> {
    const syncMessage = message || SyncMessages.starting(marketplace);
    const syncId = await ctx.db.insert("syncs", {
        userId,
        marketplace,
        status: "active",
        total: 0,
        complete: 0,
        message: syncMessage,
        startedAt: Date.now(),
    });

    return syncId;
}

/**
 * Update sync progress (internal helper for mutation context)
 */
async function updateSync(
    ctx: any,
    syncId: Id<"syncs">,
    updates: {
        total?: number;
        complete?: number;
        message?: string;
        status?: "active" | "canceled" | "finished";
        error?: string;
    }
): Promise<void> {
    const patch: any = {};

    if (updates.total !== undefined) {
        patch.total = updates.total;
    }
    if (updates.complete !== undefined) {
        patch.complete = updates.complete;
    }
    if (updates.message !== undefined) {
        patch.message = updates.message;
    }
    if (updates.status !== undefined) {
        patch.status = updates.status;
        if (updates.status === "finished" || updates.status === "canceled") {
            patch.finishedAt = Date.now();
        }
    }
    if (updates.error !== undefined) {
        patch.error = updates.error;
        patch.status = "finished";
        patch.finishedAt = Date.now();
    }

    await ctx.db.patch(syncId, patch);
}

/**
 * Cancel an active sync
 * Works from both mutations and actions
 */
export async function cancelSync(
    ctx: any,
    syncId: Id<"syncs">,
    reason?: string
): Promise<void> {
    const message = SyncMessages.canceled(reason);
    // Check if we're in an action context (has runMutation) or mutation context (has db)
    if (ctx.runMutation) {
        // Action context - use internal mutation
        // @ts-expect-error - Type instantiation is excessively deep, using type assertion to bypass
        const cancelSyncMutation = internal.products.cancelSync;
        await ctx.runMutation(cancelSyncMutation as any, {
            syncId,
            message,
        });
    } else {
        // Mutation context - direct db access
        await updateSync(ctx, syncId, {
            status: "canceled",
            message,
        });
    }
}

/**
 * Finish a sync successfully
 * Works from both mutations and actions
 */
export async function finishSync(
    ctx: any,
    syncId: Id<"syncs">,
    marketplace?: MarketplaceType,
    message?: string
): Promise<void> {
    const syncMessage = message || SyncMessages.complete(marketplace);
    // Check if we're in an action context (has runMutation) or mutation context (has db)
    if (ctx.runMutation) {
        // Action context - use internal mutation
        await ctx.runMutation(internal.products.finishSync, {
            syncId,
            message: syncMessage,
        });
    } else {
        // Mutation context - direct db access
        await updateSync(ctx, syncId, {
            status: "finished",
            message: syncMessage,
        });
    }
}

/**
 * Mark sync as failed
 * Works from both mutations and actions
 */
export async function failSync(
    ctx: any,
    syncId: Id<"syncs">,
    error: string,
    marketplace?: MarketplaceType
): Promise<void> {
    const message = marketplace
        ? SyncMessages.failed(marketplace, error)
        : `Sync failed: ${error}`;

    // Check if we're in an action context (has runMutation) or mutation context (has db)
    if (ctx.runMutation) {
        // Action context - use internal mutation
        await ctx.runMutation(internal.products.failSync, {
            syncId,
            error,
            message,
        });
    } else {
        // Mutation context - direct db access
        await updateSync(ctx, syncId, {
            status: "finished",
            error,
            message,
        });
    }
}

/**
 * Cancel all active syncs for a specific marketplace and user
 */
export async function cancelActiveSyncsForMarketplace(
    ctx: any,
    userId: Id<"users">,
    marketplace: MarketplaceType
): Promise<void> {
    // Check if we're in an action context (has runMutation) or mutation context (has db)
    if (ctx.runMutation) {
        // Action context - use internal mutation
        await ctx.runMutation(
            internal.products.cancelActiveSyncsForMarketplace,
            {
                userId,
                marketplace,
            }
        );
    } else {
        // Mutation context - direct db access
        const activeSyncs = await ctx.db
            .query("syncs")
            .withIndex("by_user_and_marketplace", (q: any) =>
                q.eq("userId", userId).eq("marketplace", marketplace)
            )
            .filter((q: any) => q.eq(q.field("status"), "active"))
            .collect();

        for (const sync of activeSyncs) {
            await cancelSync(ctx, sync._id, "new sync started");
        }
    }
}

/**
 * Check if a sync exists and is active
 * Returns true if sync exists and is active, false otherwise
 */
export async function isSyncActive(
    ctx: any,
    syncId: Id<"syncs">
): Promise<boolean> {
    const sync = await ctx.runQuery(internal.products.getSyncById, { syncId });
    return sync !== null && sync.status === "active";
}

/**
 * Check if a sync has been canceled or doesn't exist
 * Throws an error if sync doesn't exist or is not active
 */
export async function validateSyncActive(
    ctx: any,
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
 * Check if a sync has been canceled
 */
export async function isSyncCanceled(
    ctx: any,
    syncId: Id<"syncs">
): Promise<boolean> {
    const sync = await ctx.runQuery(internal.products.getSyncById, { syncId });
    return sync === null || sync.status === "canceled";
}

/**
 * Update sync progress
 */
export async function updateSyncProgress(
    ctx: any,
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
    ctx: any,
    syncId: Id<"syncs">,
    error: any,
    marketplace: MarketplaceType
) {
    const marketplaceName =
        marketplace.charAt(0).toUpperCase() + marketplace.slice(1);
    const log = {
        operation: "sync_orders",
        marketplace: marketplaceName,
        syncId: syncId.toString(),
        error: error.message || String(error),
        timestamp: new Date().toISOString(),
    };
    console.error(JSON.stringify(log));

    await failSync(ctx, syncId, error.message || String(error), marketplace);

    throw error;
}

/**
 * Process items with progress tracking
 */
export async function processWithProgress<T>(
    ctx: any,
    syncId: Id<"syncs">,
    items: T[],
    processor: (item: T, index: number) => Promise<void>,
    marketplace: MarketplaceType,
    progressMessage?: string
) {
    const message = progressMessage || SyncMessages.processing(marketplace);

    // Validate sync exists and is active before starting
    await validateSyncActive(ctx, syncId);

    await updateSyncProgress(ctx, syncId, message, {
        current: 0,
        total: items.length,
    });

    for (let i = 0; i < items.length; i++) {
        // Validate sync exists and is active before processing each item
        await validateSyncActive(ctx, syncId);

        await processor(items[i], i);

        await updateSyncProgress(ctx, syncId, message, {
            current: i + 1,
            total: items.length,
        });
    }
}
