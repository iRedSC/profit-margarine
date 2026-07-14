import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { createIsConnectedQuery } from "./marketplaceConnections";

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
