import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { syncMarketplaceValidator } from "./lib/validators";
import { isOrderRetryDue } from "./lib/orderRetry";

// Retries share the scheduled run with cost refresh and discovery, so a big
// backlog (e.g. after an outage) drains over several hourly runs instead of
// using up one run's time before new orders are discovered.
const MAX_RETRIES_PER_RUN = 30;

const failureKey = {
    userId: v.id("users"),
    marketplace: syncMarketplaceValidator,
    orderId: v.string(),
};

export const recordOrderFailure = internalMutation({
    args: { ...failureKey, error: v.string() },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("failedOrders")
            .withIndex("by_user_marketplace_order", (q) =>
                q
                    .eq("userId", args.userId)
                    .eq("marketplace", args.marketplace)
                    .eq("orderId", args.orderId)
            )
            .unique();
        const now = Date.now();
        if (existing) {
            await ctx.db.patch(existing._id, {
                attempts: existing.attempts + 1,
                lastAttemptAt: now,
                lastError: args.error,
            });
            return;
        }
        await ctx.db.insert("failedOrders", {
            userId: args.userId,
            marketplace: args.marketplace,
            orderId: args.orderId,
            attempts: 1,
            lastAttemptAt: now,
            lastError: args.error,
        });
    },
});

export const clearOrderFailure = internalMutation({
    args: failureKey,
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("failedOrders")
            .withIndex("by_user_marketplace_order", (q) =>
                q
                    .eq("userId", args.userId)
                    .eq("marketplace", args.marketplace)
                    .eq("orderId", args.orderId)
            )
            .unique();
        if (existing) await ctx.db.delete(existing._id);
    },
});

export const getOrderFailuresDueForRetry = internalQuery({
    args: {
        userId: v.id("users"),
        marketplace: syncMarketplaceValidator,
        now: v.number(),
    },
    handler: async (ctx, args) => {
        const failures = await ctx.db
            .query("failedOrders")
            .withIndex("by_user_marketplace_order", (q) =>
                q.eq("userId", args.userId).eq("marketplace", args.marketplace)
            )
            .collect();
        return failures
            .filter((failure) => isOrderRetryDue(failure, args.now))
            .sort((a, b) => a.lastAttemptAt - b.lastAttemptAt)
            .slice(0, MAX_RETRIES_PER_RUN)
            .map((failure) => failure.orderId);
    },
});
