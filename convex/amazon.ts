"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import AmazonSPAPI from "amazon-sp-api";
import {
    generateMonthlyBatches,
    updateSyncProgress,
    handleSyncError,
    processWithProgress,
    isSyncCanceled,
    validateSyncActive,
} from "./marketplaceUtils";
import { finishSync } from "./marketplaceSync";
import { SyncMessages } from "./syncMessages";
const SellingPartnerAPI = (AmazonSPAPI as any).default || AmazonSPAPI;

// Add your Amazon SP-API credentials as environment variables:
// - AMAZON_CLIENT_ID (LWA Client ID)
// - AMAZON_CLIENT_SECRET (LWA Client Secret)
// - AMAZON_REFRESH_TOKEN (Refresh Token)
// - AMAZON_REGION (must be "na", "eu", or "fe")

function getSellingPartnerAPI() {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;
    const refreshToken = process.env.AMAZON_REFRESH_TOKEN;
    const regionEnv = process.env.AMAZON_REGION;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
            "Amazon API credentials not configured. Please set AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN, and AMAZON_REGION environment variables."
        );
    }

    // Validate region
    const validRegions = ["na", "eu", "fe"];
    const region =
        regionEnv && validRegions.includes(regionEnv) ? regionEnv : null;

    if (!region) {
        throw new Error(
            `Invalid AMAZON_REGION. Please set it to one of: "na" (North America), "eu" (Europe), or "fe" (Far East). Current value: ${regionEnv || "not set"}`
        );
    }

    return new SellingPartnerAPI({
        region: region,
        refresh_token: refreshToken,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: clientId,
            SELLING_PARTNER_APP_CLIENT_SECRET: clientSecret,
        },
    });
}

export const processAmazonOrder = internalAction({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const log: {
            operation: string;
            orderId: string;
            userId: string;
            updateExisting: boolean;
            timestamp: string;
            orderData?: {
                orderStatus?: string;
                purchaseDate?: string;
                orderTimestamp?: number;
                orderExists?: boolean;
            };
            shippingData?: {
                rawShippingCost: number;
                shippingInsurance: number;
                totalShippingWithInsurance: number;
                adjustedShippingCost: number;
                buyerPaidShipping: number;
                shippingAdjustments?: Array<{ type: string; amount: number }>;
                wasNegative: boolean;
            };
            fulfillmentData?: {
                fulfillmentTimestamp?: number;
                fulfillmentDate?: string;
            };
            rawFinancialEvents?: {
                hasAdjustmentEventList: boolean;
                adjustmentEventListLength: number;
                hasShipmentEventList: boolean;
                shipmentEventListLength: number;
            } | null;
            items?: Array<{
                sku: string;
                title: string;
                quantity: number;
                price: number;
                pricePerUnit: number;
                fees: number;
                feesPerUnit: number;
                feesBreakdown: Array<[string, number]>;
                shippingPerUnit: number;
                buyerPaidShippingPerUnit: number;
            }>;
            summary: {
                totalItems: number;
                totalQuantity: number;
                itemsProcessed: number;
                itemsCreated: number;
            };
            errors: Array<{ step: string; error: string; timestamp: string }>;
            skipped: boolean;
            skippedReason?: string;
        } = {
            operation: "process_amazon_order",
            orderId: args.orderId,
            userId: args.userId,
            updateExisting: args.updateExisting ?? false,
            timestamp: new Date().toISOString(),
            summary: {
                totalItems: 0,
                totalQuantity: 0,
                itemsProcessed: 0,
                itemsCreated: 0,
            },
            errors: [],
            skipped: false,
        };

        try {
            const spApi = getSellingPartnerAPI();

            // First, get the order details to get the timestamp
            const orderResponse = await spApi.callAPI({
                operation: "getOrder",
                endpoint: "orders",
                path: {
                    orderId: args.orderId,
                },
            });

            const orderTimestamp = new Date(
                orderResponse.PurchaseDate
            ).getTime();

            // Check if order is cancelled
            const orderStatus = orderResponse.OrderStatus;
            log.orderData = {
                orderStatus: orderStatus,
                purchaseDate: orderResponse.PurchaseDate,
                orderTimestamp: orderTimestamp,
            };

            if (orderStatus === "Canceled" || orderStatus === "Cancelled") {
                log.skipped = true;
                log.skippedReason = "Order is cancelled";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            // Check if order already exists (by orderId and orderDate)
            const orderExists = await ctx.runQuery(
                internal.products.checkOrderExists,
                {
                    userId: args.userId,
                    orderId: args.orderId,
                    orderDate: orderTimestamp,
                }
            );

            log.orderData.orderExists = orderExists;

            if (orderExists && !args.updateExisting) {
                log.skipped = true;
                log.skippedReason = "Order already exists";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            const orderItemsResponse = await spApi.callAPI({
                operation: "getOrderItems",
                endpoint: "orders",
                path: {
                    orderId: args.orderId,
                },
            });

            const orderItems = orderItemsResponse.OrderItems || [];
            log.summary.totalItems = orderItems.length;

            // Calculate total shipping cost for the order to split across items
            let rawTotalOrderShipping = 0;

            // Calculate total buyer paid shipping from order items
            let totalBuyerPaidShipping = 0;
            for (const item of orderItems) {
                const shippingPrice = parseFloat(
                    item.ShippingPrice?.Amount || "0"
                );
                totalBuyerPaidShipping += shippingPrice;
            }

            // Get financial events for this order to get actual fees and shipping costs
            let financialEvents = null;
            const shippingAdjustments: Array<{ type: string; amount: number }> = [];
            try {
                const financialResponse = await spApi.callAPI({
                    operation: "listFinancialEventsByOrderId",
                    endpoint: "finances",
                    path: {
                        orderId: args.orderId,
                    },
                });
                financialEvents = financialResponse.FinancialEvents;
            } catch (error: any) {
                log.errors.push({
                    step: "fetch_financial_events",
                    error: error.message || String(error),
                    timestamp: new Date().toISOString(),
                });
            }

            // Calculate total shipping from AdjustmentEventList
            // Note: Amazon uses negative values to represent debits (costs)
            // We need to convert negative values to positive for our cost calculations
            let shippingInsurance = 0;
            if (financialEvents?.AdjustmentEventList) {
                for (const adjustment of financialEvents.AdjustmentEventList) {
                    const adjustmentType = adjustment.AdjustmentType || "";
                    const adjustmentAmount = parseFloat(
                        adjustment.AdjustmentAmount?.CurrencyAmount || "0"
                    );
                    
                    // Capture postage (base shipping cost)
                    if (adjustmentType === "PostageBilling_Postage") {
                        // Amazon uses negative for debits, so convert to positive cost
                        rawTotalOrderShipping += Math.abs(adjustmentAmount);
                        shippingAdjustments.push({
                            type: adjustmentType,
                            amount: adjustmentAmount, // Keep original for logging
                        });
                    }
                    // Capture shipping insurance
                    else if (
                        adjustmentType === "PostageBilling_Insurance" ||
                        adjustmentType === "PostageBilling_ShippingInsurance" ||
                        adjustmentType.includes("Insurance")
                    ) {
                        // Amazon uses negative for debits, so convert to positive cost
                        shippingInsurance += Math.abs(adjustmentAmount);
                        shippingAdjustments.push({
                            type: adjustmentType,
                            amount: adjustmentAmount, // Keep original for logging
                        });
                    }
                    // Capture any other postage-related adjustments
                    else if (adjustmentType.startsWith("PostageBilling_")) {
                        shippingAdjustments.push({
                            type: adjustmentType,
                            amount: adjustmentAmount,
                        });
                    }
                }
            }
            
            // Calculate total shipping including insurance (now both are positive)
            const totalShippingWithInsurance = rawTotalOrderShipping + shippingInsurance;
            
            // Log raw financial events for debugging
            log.rawFinancialEvents = financialEvents ? {
                hasAdjustmentEventList: !!financialEvents.AdjustmentEventList,
                adjustmentEventListLength: financialEvents.AdjustmentEventList?.length || 0,
                hasShipmentEventList: !!financialEvents.ShipmentEventList,
                shipmentEventListLength: financialEvents.ShipmentEventList?.length || 0,
            } : null;
            
            log.shippingData = {
                rawShippingCost: rawTotalOrderShipping,
                shippingInsurance: shippingInsurance,
                totalShippingWithInsurance: totalShippingWithInsurance,
                adjustedShippingCost: totalShippingWithInsurance,
                buyerPaidShipping: totalBuyerPaidShipping,
                shippingAdjustments: shippingAdjustments.length > 0 ? shippingAdjustments : undefined,
                wasNegative: false, // After converting negative debits to positive, this is always false
            };

            // Extract fulfillment date from ShipmentEventList
            // Note: Amazon's financial events don't reliably expose shipment cancellation status
            // We rely on negative adjustments (reversals) to detect cancelled shipping charges
            let fulfillmentTimestamp: number | undefined = undefined;
            let fulfillmentDate: string | undefined = undefined;
            
            if (financialEvents?.ShipmentEventList) {
                for (const shipmentEvent of financialEvents.ShipmentEventList) {
                    if (shipmentEvent.AmazonOrderId === args.orderId) {
                        // Try to get PostedDate or ShipmentDate from the shipment event
                        const postedDate = shipmentEvent.PostedDate;
                        const shipmentDate = (shipmentEvent as any).ShipmentDate;
                        const dateToUse = postedDate || shipmentDate;
                        
                        if (dateToUse) {
                            const parsedDate = new Date(dateToUse).getTime();
                            // Use the earliest shipment date if multiple shipments exist
                            if (!fulfillmentTimestamp || parsedDate < fulfillmentTimestamp) {
                                fulfillmentTimestamp = parsedDate;
                                fulfillmentDate = dateToUse;
                            }
                        }
                    }
                }
            }
            
            if (fulfillmentTimestamp) {
                log.fulfillmentData = {
                    fulfillmentTimestamp: fulfillmentTimestamp,
                    fulfillmentDate: fulfillmentDate,
                };
            }

            // Calculate total quantity across all items
            const totalQuantity = orderItems.reduce(
                (sum: number, item: any) => {
                    return sum + parseInt(item.QuantityOrdered || "1");
                },
                0
            );
            log.summary.totalQuantity = totalQuantity;

            // Use total shipping including insurance for calculations
            // After converting negative debits to positive, totalShippingWithInsurance should always be >= 0
            const totalOrderShipping = totalShippingWithInsurance;
            
            // Split shipping evenly across all units
            const shippingPerUnit =
                totalQuantity > 0 ? totalOrderShipping / totalQuantity : 0;

            // Split buyer paid shipping evenly across all units (using same shippingPercentage)
            const buyerPaidShippingPerUnit =
                totalQuantity > 0 ? totalBuyerPaidShipping / totalQuantity : 0;

            const logItems: Array<{
                sku: string;
                title: string;
                quantity: number;
                price: number;
                pricePerUnit: number;
                fees: number;
                feesPerUnit: number;
                feesBreakdown: Array<[string, number]>;
                shippingPerUnit: number;
                buyerPaidShippingPerUnit: number;
            }> = [];
            
            let itemsCreated = 0;
            for (const item of orderItems) {
                const price = parseFloat(item.ItemPrice?.Amount || "0");
                if (price === 0) {
                    continue;
                }
                const quantity = parseInt(item.QuantityOrdered || "1");

                // Get actual fees from financial events
                let actualFees = 0;
                const feesBreakdown: Array<[string, number]> = [];

                if (financialEvents?.ShipmentEventList) {
                    for (const shipmentEvent of financialEvents.ShipmentEventList) {
                        if (shipmentEvent.AmazonOrderId === args.orderId) {
                            // Get item-level fees from ShipmentItemList
                            if (shipmentEvent.ShipmentItemList) {
                                for (const shipmentItem of shipmentEvent.ShipmentItemList) {
                                    if (
                                        shipmentItem.SellerSKU ===
                                        item.SellerSKU
                                    ) {
                                        // Sum all item fees (Amazon fees, not customer charges)
                                        if (shipmentItem.ItemFeeList) {
                                            for (const fee of shipmentItem.ItemFeeList) {
                                                const feeAmount = Math.abs(
                                                    parseFloat(
                                                        fee.FeeAmount
                                                            ?.CurrencyAmount ||
                                                            "0"
                                                    )
                                                );
                                                actualFees += feeAmount;
                                                const feeType = fee.FeeType || fee.FeeName || "Item Fee";
                                                feesBreakdown.push([feeType, feeAmount]);
                                            }
                                        }
                                    }
                                }
                            }

                            // Get order-level fees from OrderFeeList
                            if (shipmentEvent.OrderFeeList) {
                                for (const fee of shipmentEvent.OrderFeeList) {
                                    const feeAmount = Math.abs(
                                        parseFloat(
                                            fee.FeeAmount?.CurrencyAmount || "0"
                                        )
                                    );
                                    actualFees += feeAmount;
                                    const feeType = fee.FeeType || fee.FeeName || "Order Fee";
                                    feesBreakdown.push([feeType, feeAmount]);
                                }
                            }
                        }
                    }
                }

                // If we didn't get financial data, fall back to estimates
                if (actualFees === 0) {
                    actualFees = price * 0.15;
                    feesBreakdown.push(["Amazon Fee (Estimated 15%)", actualFees]);
                }

                // Divide fees and price by quantity to get per-unit values
                const feesPerUnit = actualFees / quantity;
                const pricePerUnit = price / quantity;
                // Divide fee breakdown by quantity to get per-unit values
                const feesBreakdownPerUnit = feesBreakdown.map(([type, amount]) => [
                    type,
                    amount / quantity,
                ]);

                // Create shipping breakdown (base shipping + insurance)
                const shippingBreakdown: Array<[string, number]> = [];
                const baseShippingPerUnit = (rawTotalOrderShipping / totalQuantity);
                const insurancePerUnit = (shippingInsurance / totalQuantity);
                
                if (baseShippingPerUnit > 0 || insurancePerUnit > 0) {
                    if (baseShippingPerUnit > 0) {
                        shippingBreakdown.push(["Base Shipping", baseShippingPerUnit]);
                    }
                    if (insurancePerUnit > 0) {
                        shippingBreakdown.push(["Shipping Insurance", insurancePerUnit]);
                    }
                }

                // Don't update message here - let the main sync loop handle it

                // Calculate shipping percentage (what % of total order shipping this unit represents)
                // Only show percentage if shipping is split across multiple items (not 100%)
                const shippingPercentage =
                    totalOrderShipping > 0 && totalQuantity > 1
                        ? (shippingPerUnit / totalOrderShipping) * 100
                        : totalQuantity === 1 ? 100 : undefined;

                // Store item data in log before processing
                logItems.push({
                    sku: item.SellerSKU,
                    title: item.Title,
                    quantity: quantity,
                    price: price,
                    pricePerUnit: pricePerUnit,
                    fees: actualFees,
                    feesPerUnit: feesPerUnit,
                    feesBreakdown: feesBreakdown,
                    shippingPerUnit: shippingPerUnit,
                    buyerPaidShippingPerUnit: buyerPaidShippingPerUnit,
                });

                // Create a marketplace product for each quantity
                for (let i = 0; i < quantity; i++) {
                    await ctx.runMutation(
                        internal.products.upsertMarketplaceProduct,
                        {
                            userId: args.userId,
                            marketplace: "Amazon",
                            sku: item.SellerSKU,
                            name: item.Title,
                            price: pricePerUnit,
                            fees: feesPerUnit,
                            fees_breakdown: feesBreakdownPerUnit,
                            shipping: shippingPerUnit,
                            shipping_breakdown: shippingBreakdown.length > 0 ? shippingBreakdown : undefined,
                            shippingPercentage,
                            buyerPaidShipping: buyerPaidShippingPerUnit,
                            orderTimestamp,
                            fulfillmentTimestamp,
                            orderId: args.orderId,
                            OrderId: args.orderId,
                            updateExisting: args.updateExisting ?? false,
                        }
                    );
                    log.summary.itemsCreated++;
                }
                log.summary.itemsProcessed++;
            }

            log.items = logItems;
            console.error(JSON.stringify(log));
            return { success: true, itemsProcessed: orderItems.length };
        } catch (error: any) {
            log.errors.push({
                step: "process_order",
                error: error.message || String(error),
                timestamp: new Date().toISOString(),
            });
            console.error(JSON.stringify(log));
            throw error;
        }
    },
});

export const syncAmazonOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            const spApi = getSellingPartnerAPI();

            // Amazon requires LastUpdatedBefore to be at least 2 minutes before current time
            // Subtract 3 minutes for safety margin
            const endDate = new Date(Date.now() - 3 * 60 * 1000);
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);

            const batches = generateMonthlyBatches(startDate, endDate);

            // First, collect all orders from all batches
            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("amazon"),
                { current: 0, total: 0 }
            );

            const allOrders: Array<{ AmazonOrderId: string }> = [];

            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                // Validate sync exists and is active before processing each batch
                await validateSyncActive(ctx, args.syncId);

                const batch = batches[batchIndex];
                const batchStartDate = batch.start.toISOString();

                const ordersResponse = await spApi.callAPI({
                    operation: "getOrders",
                    endpoint: "orders",
                    query: {
                        MarketplaceIds: ["ATVPDKIKX0DER"], // US marketplace
                        LastUpdatedAfter: batchStartDate,
                        LastUpdatedBefore: batch.end.toISOString(),
                        OrderStatuses: ["Shipped"],
                    },
                });

                const orders = ordersResponse.Orders || [];
                allOrders.push(...orders);

                // Small delay between batches to avoid rate limiting
                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            // Now process all orders with proper progress tracking
            await processWithProgress(
                ctx,
                args.syncId,
                allOrders,
                async (order: { AmazonOrderId: string }, _i) => {
                    await ctx.runAction(internal.amazon.processAmazonOrder, {
                        userId: args.userId,
                        orderId: order.AmazonOrderId,
                        updateExisting: args.updateExisting ?? false,
                    });
                },
                "amazon"
            );

            // Validate sync exists and is active before finishing
            await validateSyncActive(ctx, args.syncId);

            await finishSync(ctx, args.syncId, "amazon");

            return { success: true, ordersProcessed: allOrders.length };
        } catch (error: any) {
            // Don't treat cancellation or missing sync as an error - it's expected
            if (error.message === "Sync was canceled" || 
                error.message === "Sync does not exist" ||
                error.message?.includes("Sync is not active")) {
                return { success: false, canceled: true };
            }
            // Only handle error if sync still exists
            const syncExists = await ctx.runQuery(internal.products.getSyncById, { syncId: args.syncId });
            if (syncExists) {
                await handleSyncError(ctx, args.syncId, error, "amazon");
            }
            throw error;
        }
    },
});

export const syncAmazonOrders = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        startDate: v.optional(v.string()),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            const spApi = getSellingPartnerAPI();

            // Default to last 24 hours if no start date provided
            const startDate =
                args.startDate ||
                new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

            const ordersResponse = await spApi.callAPI({
                operation: "getOrders",
                endpoint: "orders",
                query: {
                    MarketplaceIds: ["ATVPDKIKX0DER"], // US marketplace - change as needed
                    LastUpdatedAfter: startDate,
                    // Only fetch shipped orders
                    OrderStatuses: ["Shipped"],
                },
            });

            const orders = ordersResponse.Orders || [];

            await processWithProgress(
                ctx,
                args.syncId,
                orders,
                async (order: { AmazonOrderId: string }, _i) => {
                    await ctx.runAction(internal.amazon.processAmazonOrder, {
                        userId: args.userId,
                        orderId: order.AmazonOrderId,
                        updateExisting: args.updateExisting ?? false,
                    });
                },
                "amazon"
            );

            await finishSync(ctx, args.syncId, "amazon");

            return { success: true, ordersProcessed: orders.length };
        } catch (error: any) {
            console.error("Error details:", error.message);
            if (error.response) {
                console.error(
                    "API Response:",
                    JSON.stringify(error.response, null, 2)
                );
            }
            await handleSyncError(ctx, args.syncId, error, "amazon");
            throw error;
        }
    },
});
