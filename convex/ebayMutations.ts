import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { createIsConnectedQuery } from "./marketplaceConnections";

export const logAccountDeletion = internalMutation({
    args: {
        ebayUserId: v.string(),
        username: v.string(),
        deletionDate: v.string(),
        notificationData: v.string(),
        verified: v.boolean(),
    },
    handler: async (ctx, args) => {
        await ctx.db.insert("ebayAccountDeletions", {
            ebayUserId: args.ebayUserId,
            username: args.username,
            deletionDate: args.deletionDate,
            notificationData: args.notificationData,
            processedAt: Date.now(),
            verified: args.verified,
        });

        return null;
    },
});

export const isEbayConnected = createIsConnectedQuery("ebay");

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
            internal.ebayOAuth.exchangeCodeForToken,
            {
                code: args.code,
                userId,
            }
        );

        return { success: true };
    },
});
