import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";

export const resyncOrder = mutation({
    args: {
        marketplaceProductId: v.id("marketplaceProducts"),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const mp = await ctx.db.get(args.marketplaceProductId);
        if (!mp || mp.userId !== userId) {
            throw new Error("Marketplace product not found or unauthorized");
        }

        if (!mp.orderId && !mp.OrderId) {
            throw new Error("Order ID not found for this product");
        }

        // Schedule the resync action
        await ctx.scheduler.runAfter(
            0,
            internal.productResync.resyncOrderAction,
            {
                userId,
                marketplaceProductId: args.marketplaceProductId,
                marketplace: mp.marketplace,
                orderId: mp.orderId || mp.OrderId || "",
            }
        );

        return { message: "Order resync started" };
    },
});

export const syncOrderById = mutation({
    args: {
        marketplace: v.union(
            v.literal("Ebay"),
            v.literal("Amazon"),
            v.literal("Shopify"),
            v.literal("TikTok")
        ),
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        if (!args.orderId || args.orderId.trim() === "") {
            throw new Error("Order ID is required");
        }

        // Schedule the sync action
        await ctx.scheduler.runAfter(
            0,
            internal.productResync.syncOrderByIdAction,
            {
                userId,
                marketplace: args.marketplace,
                orderId: args.orderId.trim(),
            }
        );

        return { message: "Order sync started" };
    },
});

export const resyncAllOrders = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        // Create a sync record for tracking progress
        // Use "amazon" as the marketplace type but with a custom message
        const syncId = await ctx.db.insert("syncs", {
            userId,
            marketplace: "amazon", // Using "amazon" as placeholder, message will indicate it's for all
            status: "active",
            total: 0,
            complete: 0,
            message:
                "Resyncing all orders from existing marketplace products...",
            startedAt: Date.now(),
        });

        // Schedule the resync action
        await ctx.scheduler.runAfter(
            0,
            internal.productResync.resyncAllOrdersAction,
            {
                userId,
                syncId,
            }
        );

        return { message: "Resync all orders started" };
    },
});

export const retryPendingAmazonImports = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const syncId = await ctx.db.insert("syncs", {
            userId,
            marketplace: "amazon",
            status: "active",
            total: 0,
            complete: 0,
            message: "Retrying pending Amazon imports...",
            startedAt: Date.now(),
        });

        await ctx.scheduler.runAfter(
            0,
            internal.amazon.retryPendingAmazonImports,
            {
                userId,
                syncId,
            }
        );

        return { message: "Pending Amazon import retry started" };
    },
});
