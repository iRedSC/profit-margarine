import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, query } from "./_generated/server";
import { isAmazonOwner, requireAmazonOwner } from "./lib/amazonOwner";

/** For the UI: whether the signed-in user may sync the deployment's Amazon account. */
export const canSyncAmazon = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        return userId ? await isAmazonOwner(ctx, userId) : false;
    },
});

/** Called by every action before it touches the Amazon SP-API for a user. */
export const assertAmazonOwner = internalQuery({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        await requireAmazonOwner(ctx, args.userId);
    },
});
