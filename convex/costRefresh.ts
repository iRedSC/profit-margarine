import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { productMarketplaceValidator } from "./lib/validators";
import {
    COST_SETTLEMENT_WINDOW_MS,
    isCostRefreshDue,
    missingCosts,
} from "./lib/costCompleteness";

// Bounds one cron tick's API usage. Anything left over is picked up next hour,
// most overdue first.
const MAX_ORDERS_PER_RUN = 30;

export type CostRefreshOrder = {
    orderId: string;
    orderDate: number;
};

/** Orders from the last two weeks still missing real fees or labels. */
export const getOrdersDueForCostRefresh = internalQuery({
    args: {
        userId: v.id("users"),
        marketplace: productMarketplaceValidator,
        now: v.number(),
    },
    handler: async (ctx, args): Promise<CostRefreshOrder[]> => {
        const since = args.now - COST_SETTLEMENT_WINDOW_MS;
        // One order can have many unit rows; the oldest check wins.
        const lastCheckedByOrder = new Map<
            string,
            CostRefreshOrder & { lastCheckedAt: number }
        >();
        const consider = (
            orderId: string,
            orderDate: number,
            lastCheckedAt: number
        ) => {
            if (!isCostRefreshDue({ orderDate, lastCheckedAt, now: args.now }))
                return;
            const seen = lastCheckedByOrder.get(orderId);
            if (!seen || lastCheckedAt < seen.lastCheckedAt) {
                lastCheckedByOrder.set(orderId, {
                    orderId,
                    orderDate,
                    lastCheckedAt,
                });
            }
        };

        const rows = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_user_marketplace_order_date", (q) =>
                q
                    .eq("userId", args.userId)
                    .eq("marketplace", args.marketplace)
                    .gte("orderDate", since)
            )
            .collect();
        for (const row of rows) {
            if (!row.orderId || missingCosts(row).length === 0) continue;
            consider(
                row.orderId,
                row.orderDate,
                row.costsCheckedAt ?? row._creationTime
            );
        }

        // Amazon holds orders without settled finance out of the main list.
        if (args.marketplace === "Amazon") {
            const pending = await ctx.db
                .query("pendingMarketplaceImports")
                .withIndex("by_user_marketplace_status", (q) =>
                    q
                        .eq("userId", args.userId)
                        .eq("marketplace", "Amazon")
                        .eq("status", "pending")
                )
                .collect();
            for (const row of pending) {
                if (row.orderDate < since) continue;
                consider(row.orderId, row.orderDate, row.lastAttemptAt);
            }
        }

        return [...lastCheckedByOrder.values()]
            .sort((a, b) => a.lastCheckedAt - b.lastCheckedAt)
            .slice(0, MAX_ORDERS_PER_RUN)
            .map(({ orderId, orderDate }) => ({ orderId, orderDate }));
    },
});

/**
 * Record that we asked. Runs after the refresh because eBay and TikTok
 * replace an order's rows when they update it.
 */
export const markCostsChecked = internalMutation({
    args: {
        userId: v.id("users"),
        marketplace: productMarketplaceValidator,
        orderId: v.string(),
        checkedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const rows = await ctx.db
            .query("marketplaceProducts")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("marketplace"), args.marketplace)
                )
            )
            .collect();
        for (const row of rows) {
            await ctx.db.patch(row._id, { costsCheckedAt: args.checkedAt });
        }

        const pending = await ctx.db
            .query("pendingMarketplaceImports")
            .withIndex("by_order_id", (q) => q.eq("orderId", args.orderId))
            .filter((q) =>
                q.and(
                    q.eq(q.field("userId"), args.userId),
                    q.eq(q.field("status"), "pending")
                )
            )
            .collect();
        for (const row of pending) {
            await ctx.db.patch(row._id, { lastAttemptAt: args.checkedAt });
        }
    },
});
