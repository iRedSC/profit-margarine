"use node";

import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { updateSync, finishSync, failSync } from "./marketplaceSync";
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

export type MarketplaceType = "amazon" | "ebay" | "shopify";

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
  const marketplaceName = marketplace.charAt(0).toUpperCase() + marketplace.slice(1);
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

  await updateSyncProgress(
    ctx,
    syncId,
    message,
    { current: 0, total: items.length }
  );

  for (let i = 0; i < items.length; i++) {
    // Validate sync exists and is active before processing each item
    await validateSyncActive(ctx, syncId);

    await processor(items[i], i);

    await updateSyncProgress(
      ctx,
      syncId,
      message,
      { current: i + 1, total: items.length }
    );
  }
}
