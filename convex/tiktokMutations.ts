import { v } from "convex/values";
import {
    internalMutation,
    internalQuery,
    query,
    mutation,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const storeTiktokConnection = internalMutation({
    args: {
        userId: v.id("users"),
        accessToken: v.string(),
        refreshToken: v.string(),
        expiresAt: v.number(),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", "tiktok")
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                accessToken: args.accessToken,
                refreshToken: args.refreshToken,
                expiresAt: args.expiresAt,
            });
        } else {
            await ctx.db.insert("marketplaceConnections", {
                userId: args.userId,
                marketplace: "tiktok",
                accessToken: args.accessToken,
                refreshToken: args.refreshToken,
                expiresAt: args.expiresAt,
                connectedAt: Date.now(),
            });
        }
    },
});

export const getTiktokConnection = internalQuery({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", args.userId).eq("marketplace", "tiktok")
            )
            .first();

        if (!connection) {
            return null;
        }

        return {
            accessToken: connection.accessToken,
            refreshToken: connection.refreshToken,
            expiresAt: connection.expiresAt,
        };
    },
});

export const isTiktokConnected = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return false;
        }

        const connection = await ctx.db
            .query("marketplaceConnections")
            .withIndex("by_user_and_marketplace", (q) =>
                q.eq("userId", userId).eq("marketplace", "tiktok")
            )
            .first();

        return connection !== null;
    },
});

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
