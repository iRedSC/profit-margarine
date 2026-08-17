import { v } from "convex/values";
import { mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import { SyncMessages } from "../syncMessages";
import { Doc, Id } from "../_generated/dataModel";

/**
 * Helper function to initialize sync status for a marketplace
 * Cancels any existing active syncs for the same marketplace, then creates a new sync record
 */
export async function initializeSyncStatus(
    ctx: MutationCtx,
    marketplace: Doc<"syncs">["marketplace"]
): Promise<{ userId: Id<"users">; syncId: Id<"syncs"> }> {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
        throw new Error("Not authenticated");
    }

    // Cancel any existing active syncs for this marketplace
    await ctx.runMutation(internal.products.cancelActiveSyncsForMarketplace, {
        userId,
        marketplace,
    });

    // Create new sync record
    const syncMessage = SyncMessages.starting(marketplace);
    const syncId = await ctx.db.insert("syncs", {
        userId,
        marketplace,
        status: "active",
        total: 0,
        complete: 0,
        message: syncMessage,
        startedAt: Date.now(),
    });

    return { userId, syncId };
}

export const syncEbayOrders = mutation({
    args: {
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "ebay");

        await ctx.scheduler.runAfter(0, internal.ebay.syncEbayOrders, {
            userId,
            syncId,
            updateExisting: args.updateExisting ?? false,
        });

        return { message: "eBay sync started" };
    },
});

export const syncAmazonOrders = mutation({
    args: {
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "amazon");

        await ctx.scheduler.runAfter(0, internal.amazon.syncAmazonOrders, {
            userId,
            syncId,
            updateExisting: args.updateExisting,
        });

        return { message: "Amazon sync started" };
    },
});

export const syncAmazonOrdersOneYear = mutation({
    args: {
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "amazon");
        await ctx.db.patch(syncId, {
            message: SyncMessages.startingOneYear("amazon"),
        });

        await ctx.scheduler.runAfter(
            0,
            internal.amazon.syncAmazonOrdersOneYear,
            {
                userId,
                syncId,
                updateExisting: args.updateExisting,
            }
        );

        return { message: "Amazon 1-year sync started" };
    },
});

export const syncEbayOrdersOneYear = mutation({
    args: {},
    handler: async (ctx) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "ebay");
        await ctx.db.patch(syncId, {
            message: SyncMessages.startingOneYear("ebay"),
        });

        await ctx.scheduler.runAfter(0, internal.ebay.syncEbayOrdersOneYear, {
            userId,
            syncId,
        });

        return { message: "eBay 1-year sync started" };
    },
});

export const syncShopifyOrdersOneYear = mutation({
    args: {},
    handler: async (ctx) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "shopify");
        await ctx.db.patch(syncId, {
            message: SyncMessages.startingOneYear("shopify"),
        });

        await ctx.scheduler.runAfter(
            0,
            internal.shopify.syncShopifyOrdersOneYear,
            {
                userId,
                syncId,
            }
        );

        return { message: "Shopify 1-year sync started" };
    },
});

export const updateSyncProgress = internalMutation({
    args: {
        syncId: v.id("syncs"),
        message: v.string(),
        total: v.optional(v.number()),
        complete: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        const patch: Partial<Doc<"syncs">> = {
            message: args.message,
        };

        if (args.total !== undefined) {
            patch.total = args.total;
        }
        if (args.complete !== undefined) {
            patch.complete = args.complete;
        }

        await ctx.db.patch(args.syncId, patch);
    },
});

export const finishSync = internalMutation({
    args: {
        syncId: v.id("syncs"),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        await ctx.db.patch(args.syncId, {
            status: "finished",
            message: args.message,
            finishedAt: Date.now(),
        });
    },
});

export const failSync = internalMutation({
    args: {
        syncId: v.id("syncs"),
        error: v.string(),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        await ctx.db.patch(args.syncId, {
            status: "finished",
            error: args.error,
            message: args.message,
            finishedAt: Date.now(),
        });
    },
});

export const cancelSync = internalMutation({
    args: {
        syncId: v.id("syncs"),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) {
            return;
        }

        await ctx.db.patch(args.syncId, {
            status: "canceled",
            message: args.message,
            finishedAt: Date.now(),
        });
    },
});

export const cancelActiveSyncsForMarketplace = internalMutation({
    args: {
        userId: v.id("users"),
        marketplace: v.union(
            v.literal("amazon"),
            v.literal("ebay"),
            v.literal("shopify")
        ),
    },
    handler: async (ctx, args) => {
        const activeSyncs = await ctx.db
            .query("syncs")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", args.marketplace)
            )
            .filter((q) => q.eq(q.field("status"), "active"))
            .collect();

        for (const sync of activeSyncs) {
            await ctx.db.patch(sync._id, {
                status: "canceled",
                message: SyncMessages.canceledForNewSync(),
                finishedAt: Date.now(),
            });
        }
    },
});

export const cancelAllActiveSyncs = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        // Get all active syncs for the user
        const activeSyncs = await ctx.db
            .query("syncs")
            .withIndex("by_user_and_status", (q) =>
                q.eq("userId", userId).eq("status", "active")
            )
            .collect();

        // Cancel all active syncs
        for (const sync of activeSyncs) {
            await ctx.db.patch(sync._id, {
                status: "canceled",
                message: SyncMessages.canceled("user requested"),
                finishedAt: Date.now(),
            });
        }

        return { canceled: activeSyncs.length };
    },
});
