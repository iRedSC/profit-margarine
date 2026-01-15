"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const resyncOrderAction = internalAction({
    args: {
        userId: v.id("users"),
        marketplaceProductId: v.id("marketplaceProducts"),
        marketplace: v.union(
            v.literal("Ebay"),
            v.literal("Amazon"),
            v.literal("Shopify"),
            v.literal("TikTok")
        ),
        orderId: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            // Get the marketplace product to get shipping cost and other details
            const mp = await ctx.runQuery(internal.products.getMarketplaceProduct, {
                marketplaceProductId: args.marketplaceProductId,
            });

            if (!mp) {
                throw new Error("Marketplace product not found");
            }

            // Calculate total shipping cost from the product
            // For multi-item orders, we'll use the shipping cost from this product
            // The process functions will handle splitting it properly
            const shippingCost = mp.shipping || 0;

            if (args.marketplace === "Amazon") {
                await ctx.runAction(internal.amazon.processAmazonOrder, {
                    userId: args.userId,
                    orderId: args.orderId,
                    updateExisting: true,
                });
            } else if (args.marketplace === "Ebay") {
                // Get eBay access token
                const accessToken = await ctx.runAction(
                    internal.ebay.getEbayAccessTokenForResync,
                    {
                        userId: args.userId,
                    }
                );

                // Fetch the actual shipping cost from transactions (not from stored product)
                const actualShippingCost = await ctx.runAction(
                    internal.ebay.getShippingCostForOrder,
                    {
                        orderId: args.orderId,
                        accessToken,
                        orderDate: mp.orderDate,
                    }
                );

                // Fetch transactions for this specific order
                const transactions = await ctx.runAction(
                    internal.ebay.getTransactionsForOrder,
                    {
                        orderId: args.orderId,
                        accessToken,
                        orderDate: mp.orderDate,
                    }
                );

                await ctx.runAction(internal.ebay.processEbayOrder, {
                    userId: args.userId,
                    orderId: args.orderId,
                    shippingCost: actualShippingCost, // Use actual shipping from transactions
                    accessToken,
                    allTransactions: transactions,
                    updateExisting: true,
                });
            } else if (args.marketplace === "Shopify") {
                // Get Shopify connection
                const connection = await ctx.runQuery(
                    internal.shopifyMutations.getShopifyConnection,
                    {
                        userId: args.userId,
                    }
                );

                if (!connection) {
                    throw new Error(
                        "No Shopify connection found. Please connect your Shopify store first."
                    );
                }

                // For Shopify, we need the order GID (GraphQL ID)
                // If orderId is numeric, convert to GID format
                const orderGid =
                    args.orderId.startsWith("gid://") ||
                    args.orderId.startsWith("gid:")
                        ? args.orderId
                        : `gid://shopify/Order/${args.orderId}`;

                await ctx.runAction(internal.shopify.processShopifyOrder, {
                    userId: args.userId,
                    orderGid: orderGid,
                    shippingLabelCost: shippingCost,
                    shop: connection.shop,
                    accessToken: connection.accessToken,
                    updateExisting: true,
                });
            } else {
                throw new Error(`Unsupported marketplace: ${args.marketplace}`);
            }

            return { success: true };
        } catch (error: any) {
            const log = {
                operation: "resync_order",
                orderId: args.orderId,
                marketplace: "ebay",
                error: error.message || String(error),
                timestamp: new Date().toISOString(),
            };
            console.error(JSON.stringify(log));
            throw error;
        }
    },
});
