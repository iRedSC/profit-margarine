import { v } from "convex/values";
import { action, mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import { requireUserId } from "../lib/auth";

// Actions, not mutations: the caller waits for the marketplace round trip so
// its success or error toast reflects what actually happened.
export const resyncOrder = action({
    args: {
        marketplaceProductId: v.id("marketplaceProducts"),
    },
    handler: async (ctx, args): Promise<{ message: string }> => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        const mp = await ctx.runQuery(internal.products.getMarketplaceProduct, {
            marketplaceProductId: args.marketplaceProductId,
        });
        if (!mp || mp.userId !== userId) {
            throw new Error("Marketplace product not found or unauthorized");
        }

        const orderId = mp.orderId || (mp as { OrderId?: string }).OrderId;
        if (!orderId) {
            throw new Error("Order ID not found for this product");
        }

        await ctx.runAction(internal.productResync.resyncOrderAction, {
            userId,
            marketplaceProductId: args.marketplaceProductId,
            marketplace: mp.marketplace,
            orderId,
        });

        return { message: "Order resynced" };
    },
});

export const syncOrderById = action({
    args: {
        marketplace: v.union(
            v.literal("Ebay"),
            v.literal("Amazon"),
            v.literal("Shopify"),
            v.literal("TikTok")
        ),
        orderId: v.string(),
    },
    handler: async (ctx, args): Promise<{ message: string }> => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            throw new Error("Not authenticated");
        }

        if (!args.orderId || args.orderId.trim() === "") {
            throw new Error("Order ID is required");
        }

        console.error(
            JSON.stringify({
                operation: "sync_order_by_id_requested",
                marketplace: args.marketplace,
                orderId: args.orderId.trim(),
                userId: userId.toString(),
                timestamp: new Date().toISOString(),
            })
        );

        await ctx.runAction(internal.productResync.syncOrderByIdAction, {
            userId,
            marketplace: args.marketplace,
            orderId: args.orderId.trim(),
        });

        return { message: "Order synced" };
    },
});

export const resyncAllOrders = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await requireUserId(ctx);

        // Create a sync record for tracking progress
        // Use amazon as placeholder marketplace; message indicates all orders
        const syncId = await ctx.db.insert("syncs", {
            userId,
            marketplace: "amazon",
            kind: "resyncAll",
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
        const userId = await requireUserId(ctx);

        console.error(
            JSON.stringify({
                operation: "retry_pending_amazon_imports_requested",
                userId: userId.toString(),
                timestamp: new Date().toISOString(),
            })
        );

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
