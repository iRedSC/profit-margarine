"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { validateSyncActive, handleSyncError } from "./marketplaceUtils";
import { finishSync } from "./marketplaceSync";
import { Id } from "./_generated/dataModel";

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
                const shippingData = await ctx.runAction(
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
                    shippingCost: typeof shippingData === 'object' ? shippingData.shipping : shippingData, // Handle both old and new return formats
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

                // Fetch the actual shipping cost from order events (not from stored product)
                // This handles cases where multiple products ship separately with separate labels
                const actualShippingCost = await ctx.runAction(
                    internal.shopify.getShippingCostForOrder,
                    {
                        orderGid: orderGid,
                        shop: connection.shop,
                        accessToken: connection.accessToken,
                    }
                );

                await ctx.runAction(internal.shopify.processShopifyOrder, {
                    userId: args.userId,
                    orderGid: orderGid,
                    shippingLabelCost: actualShippingCost, // Use actual shipping from events
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

export const syncOrderByIdAction = internalAction({
    args: {
        userId: v.id("users"),
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

                // For new orders, we don't have orderDate, so we'll fetch transactions
                // without date filtering - the API will return recent transactions
                const transactions = await ctx.runAction(
                    internal.ebay.getTransactionsForOrder,
                    {
                        orderId: args.orderId,
                        accessToken,
                        orderDate: undefined,
                    }
                );

                // Fetch the actual shipping cost from transactions
                const actualShippingCost = await ctx.runAction(
                    internal.ebay.getShippingCostForOrder,
                    {
                        orderId: args.orderId,
                        accessToken,
                        orderDate: undefined,
                    }
                );

                await ctx.runAction(internal.ebay.processEbayOrder, {
                    userId: args.userId,
                    orderId: args.orderId,
                    shippingCost: actualShippingCost,
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

                // Fetch the actual shipping cost from order events
                const actualShippingCost = await ctx.runAction(
                    internal.shopify.getShippingCostForOrder,
                    {
                        orderGid: orderGid,
                        shop: connection.shop,
                        accessToken: connection.accessToken,
                    }
                );

                await ctx.runAction(internal.shopify.processShopifyOrder, {
                    userId: args.userId,
                    orderGid: orderGid,
                    shippingLabelCost: actualShippingCost,
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
                operation: "sync_order_by_id",
                orderId: args.orderId,
                marketplace: args.marketplace,
                error: error.message || String(error),
                timestamp: new Date().toISOString(),
            };
            console.error(JSON.stringify(log));
            throw error;
        }
    },
});

export const resyncAllOrdersAction = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
    },
    handler: async (ctx, args): Promise<{ message: string; totalProcessed?: number; totalOrders?: number }> => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            // Get all marketplace products with orders
            const ordersToResync: Array<{
                marketplaceProductId: Id<"marketplaceProducts">;
                marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
                orderId: string;
            }> = await ctx.runQuery(
                internal.products.getAllMarketplaceProductsWithOrders,
                {
                    userId: args.userId,
                }
            );

            if (ordersToResync.length === 0) {
                await finishSync(ctx, args.syncId, "amazon", "Resync complete: No orders to resync");
                return { message: "No orders to resync" };
            }

            const totalOrders: number = ordersToResync.length;

            // Update sync progress with total count
            await ctx.runMutation(internal.products.updateSyncProgress, {
                syncId: args.syncId,
                message: `Resyncing ${totalOrders} orders from existing marketplace products...`,
                total: totalOrders,
                complete: 0,
            });

            // Group by marketplace for progress tracking
            const ordersByMarketplace = new Map<string, typeof ordersToResync>();
            for (const order of ordersToResync) {
                const marketplaceKey = order.marketplace.toLowerCase();
                if (!ordersByMarketplace.has(marketplaceKey)) {
                    ordersByMarketplace.set(marketplaceKey, []);
                }
                ordersByMarketplace.get(marketplaceKey)!.push(order);
            }

            let totalProcessed = 0;

            // Process orders by marketplace
            for (const [marketplaceKey, orders] of ordersByMarketplace.entries()) {
                const marketplace = marketplaceKey as "amazon" | "ebay" | "shopify";

                // Process each order individually to update progress correctly
                for (let i = 0; i < orders.length; i++) {
                    const order = orders[i];
                    
                    // Validate sync exists and is active before processing each order
                    await validateSyncActive(ctx, args.syncId);

                    // Update progress message
                    await ctx.runMutation(internal.products.updateSyncProgress, {
                        syncId: args.syncId,
                        message: `Resyncing ${order.marketplace} orders... (${totalProcessed + 1}/${totalOrders})`,
                        total: totalOrders,
                        complete: totalProcessed,
                    });

                    try {
                        await ctx.runAction(internal.productResync.resyncOrderAction, {
                            userId: args.userId,
                            marketplaceProductId: order.marketplaceProductId,
                            marketplace: order.marketplace,
                            orderId: order.orderId,
                        });
                        totalProcessed++;
                    } catch (error: any) {
                        // Log error but continue with other orders
                        console.error(
                            JSON.stringify({
                                operation: "resync_all_orders",
                                orderId: order.orderId,
                                marketplace: order.marketplace,
                                error: error.message || String(error),
                                timestamp: new Date().toISOString(),
                            })
                        );
                        // Still increment processed count to continue
                        totalProcessed++;
                    }

                    // Update progress after each order
                    await ctx.runMutation(internal.products.updateSyncProgress, {
                        syncId: args.syncId,
                        message: `Resyncing ${order.marketplace} orders... (${totalProcessed}/${totalOrders})`,
                        total: totalOrders,
                        complete: totalProcessed,
                    });
                }
            }

            await finishSync(
                ctx,
                args.syncId,
                "amazon",
                `Resync complete: ${totalProcessed} of ${totalOrders} orders processed`
            );
            return {
                message: `Resync complete: ${totalProcessed} of ${totalOrders} orders processed`,
                totalProcessed,
                totalOrders,
            };
        } catch (error: any) {
            await handleSyncError(ctx, args.syncId, error, "amazon");
            throw error;
        }
    },
});
