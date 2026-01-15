import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { MarketplaceType } from "./marketplaceConnections";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { SyncMessages } from "./syncMessages";

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
 * Update sync progress
 */
export async function updateSync(
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
    await ctx.runMutation(internal.products.cancelSync, {
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
    await ctx.runMutation(internal.products.cancelActiveSyncsForMarketplace, {
      userId,
      marketplace,
    });
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
 * Helper function to initialize sync status for a marketplace
 * Cancels any existing active syncs for the same marketplace, then creates a new sync record
 */
export async function initializeSyncStatus(
  ctx: any,
  marketplace: MarketplaceType
): Promise<{ userId: Id<"users">; syncId: Id<"syncs"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  // Cancel any existing active syncs for this marketplace
  await cancelActiveSyncsForMarketplace(ctx, userId, marketplace);

  const syncId = await createSync(ctx, userId, marketplace);

  return { userId, syncId };
}
