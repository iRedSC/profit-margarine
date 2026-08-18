import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { createIsConnectedQuery } from "./marketplaceConnections";
import { initializeSyncStatus } from "./products/sync";
import { SyncMessages } from "./syncMessages";

export const isTiktokConnected = createIsConnectedQuery("tiktok");

export const completeOAuthFlow = mutation({
    args: {
        code: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        await ctx.scheduler.runAfter(
            0,
            internal.tiktokOAuth.exchangeCodeForToken,
            {
                code: args.code,
                userId,
            }
        );

        return { success: true };
    },
});

export const syncTiktokOrders = mutation({
    args: {
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "tiktok");

        await ctx.scheduler.runAfter(0, internal.tiktok.syncTiktokOrders, {
            userId,
            syncId,
            updateExisting: args.updateExisting ?? false,
        });

        return { message: "TikTok sync started" };
    },
});

export const syncTiktokOrdersOneYear = mutation({
    args: {},
    handler: async (ctx) => {
        const { userId, syncId } = await initializeSyncStatus(ctx, "tiktok");
        await ctx.db.patch(syncId, {
            message: SyncMessages.startingOneYear("tiktok"),
        });

        await ctx.scheduler.runAfter(
            0,
            internal.tiktok.syncTiktokOrdersOneYear,
            {
                userId,
                syncId,
            }
        );

        return { message: "TikTok 1-year sync started" };
    },
});
