"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
    AMAZON_ESTIMATED_FEE_LABEL,
    AMAZON_ESTIMATED_FEE_RATE,
    splitOrderCosts,
    toPerUnitBreakdown,
} from "../lib/orderCosts";
import { asSpApiRecord, getSellingPartnerAPI } from "./client";
import {
    extractFBAFeesFromShipmentLikeEvents,
    extractFulfillmentFromAdjustmentEvents,
    extractFulfillmentFromShipmentLikeEvents,
    extractItemFeesFromShipmentLikeEvents,
    fetchFinancialEventsForOrder,
    fetchFulfillmentFromOrderPackages,
    getPendingImportReason,
    getShipmentLikeEvents,
    hasShipmentFinancialEvents,
    summarizeRawFinancialEvents,
    type AmazonAdjustmentEvent,
    type AmazonFinancialEvents,
} from "./finance";

type AmazonOrderItem = {
    SellerSKU: string;
    Title: string;
    QuantityOrdered?: string | number;
    ItemPrice?: { Amount?: string | number };
    ShippingPrice?: { Amount?: string | number };
};

function caughtErrorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        const { message } = error;
        if (message) {
            return message as string;
        }
    }
    if (typeof error === "object" && error !== null) {
        const toString = (error as { toString?: () => string }).toString;
        if (typeof toString === "function") {
            return toString.call(error);
        }
        return Object.prototype.toString.call(error);
    }
    return String(error);
}

export const processAmazonOrder = internalAction({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        updateExisting: v.optional(v.boolean()),
        retrySource: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const log: {
            operation: string;
            orderId: string;
            userId: string;
            updateExisting: boolean;
            timestamp: string;
            retrySource?: string;
            orderData?: {
                orderStatus?: string;
                purchaseDate?: string;
                orderTimestamp?: number;
                orderExists?: boolean;
                officialRowCount?: number;
                pendingRowCount?: number;
                hasFulfilledOfficialRows?: boolean;
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
                sourceList?: string;
            };
            rawFinancialEvents?: {
                hasAnyFinancialEvents: boolean;
                hasNonShipmentFinancialEvents: boolean;
                financeStatusClassification: string;
                suggestFinancesV2024Fallback: boolean;
                nonEmptyEventLists: Array<[string, number]>;
                hasShipmentFinancialEvents: boolean;
                shipmentLikeEventCount: number;
                hasAdjustmentEventList: boolean;
                adjustmentEventListLength: number;
                hasShipmentEventList: boolean;
                shipmentEventListLength: number;
                hasShipmentSettleEventList: boolean;
                shipmentSettleEventListLength: number;
                hasTrialShipmentEventList: boolean;
                trialShipmentEventListLength: number;
                pagesFetched?: number;
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
                status?: "official" | "pending";
                reasonCode?: string;
                reasonMessage?: string;
                feeSourceLists?: string[];
            }>;
            summary: {
                totalItems: number;
                totalQuantity: number;
                itemsProcessed: number;
                itemsCreated: number;
                itemsQueued: number;
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
            retrySource: args.retrySource,
            summary: {
                totalItems: 0,
                totalQuantity: 0,
                itemsProcessed: 0,
                itemsCreated: 0,
                itemsQueued: 0,
            },
            errors: [],
            skipped: false,
        };

        try {
            const spApi = getSellingPartnerAPI();

            // First, get the order details to get the timestamp
            const orderResponse =
                asSpApiRecord(
                    await spApi.callAPI({
                        operation: "getOrder",
                        endpoint: "orders",
                        path: {
                            orderId: args.orderId,
                        },
                    })
                ) ?? {};

            const orderTimestamp = new Date(
                orderResponse.PurchaseDate as string
            ).getTime();

            // Check if order is cancelled
            const orderStatus = orderResponse.OrderStatus as string | undefined;
            
            // Check if this is an FBA order (AFN = Amazon Fulfillment Network)
            const fulfillmentChannel = (orderResponse.FulfillmentChannel ||
                "") as string;
            const isFBA = fulfillmentChannel === "AFN";
            
            log.orderData = {
                orderStatus: orderStatus,
                purchaseDate: orderResponse.PurchaseDate as string | undefined,
                orderTimestamp: orderTimestamp,
            };

            if (orderStatus === "Canceled" || orderStatus === "Cancelled") {
                log.skipped = true;
                log.skippedReason = "Order is cancelled";
                console.error(JSON.stringify(log));
                return {
                    success: true,
                    itemsProcessed: 0,
                    itemsCreated: 0,
                    itemsQueued: 0,
                    skipped: true,
                    skippedReason: log.skippedReason,
                    rawFinancialEvents: null,
                };
            }

            // Check whether this order is already tracked in either the
            // official marketplace list or the pending Amazon import queue.
            const trackedOrderState = await ctx.runQuery(
                internal.products.getAmazonOrderImportState,
                {
                    userId: args.userId,
                    orderId: args.orderId,
                    orderDate: orderTimestamp,
                }
            );

            log.orderData.orderExists = trackedOrderState.hasTrackedOrder;
            log.orderData.officialRowCount = trackedOrderState.officialRowCount;
            log.orderData.pendingRowCount = trackedOrderState.pendingRowCount;
            log.orderData.hasFulfilledOfficialRows =
                trackedOrderState.hasFulfilledOfficialRows;

            if (trackedOrderState.hasTrackedOrder && !args.updateExisting) {
                log.skipped = true;
                log.skippedReason = "Order already exists";
                console.error(JSON.stringify(log));
                return {
                    success: true,
                    itemsProcessed: 0,
                    itemsCreated: 0,
                    itemsQueued: 0,
                    skipped: true,
                    skippedReason: log.skippedReason,
                    rawFinancialEvents: null,
                };
            }

            const orderItemsResponse =
                asSpApiRecord(
                    await spApi.callAPI({
                        operation: "getOrderItems",
                        endpoint: "orders",
                        path: {
                            orderId: args.orderId,
                        },
                    })
                ) ?? {};

            const orderItems = (orderItemsResponse.OrderItems ||
                []) as AmazonOrderItem[];
            log.summary.totalItems = orderItems.length;

            // Calculate total shipping cost for the order to split across items
            let rawTotalOrderShipping = 0;

            // Calculate total buyer paid shipping from order items
            let totalBuyerPaidShipping = 0;
            for (const item of orderItems) {
                const shippingPrice = parseFloat(
                    (item.ShippingPrice?.Amount || "0") as string
                );
                totalBuyerPaidShipping += shippingPrice;
            }

            // Get financial events for this order to get actual fees and shipping costs
            let financialEvents: AmazonFinancialEvents | null = null;
            let financialEventPagesFetched = 0;
            const shippingAdjustments: Array<{ type: string; amount: number }> = [];
            try {
                const financialResult = await fetchFinancialEventsForOrder(
                    spApi,
                    args.orderId
                );
                financialEvents = financialResult.financialEvents;
                financialEventPagesFetched = financialResult.pagesFetched;
            } catch (error: unknown) {
                log.errors.push({
                    step: "fetch_financial_events",
                    error: caughtErrorMessage(error),
                    timestamp: new Date().toISOString(),
                });
            }

            const hasShipmentFinancialEventsForOrder = hasShipmentFinancialEvents(
                financialEvents,
                args.orderId
            );
            const shipmentLikeEvents = getShipmentLikeEvents(
                financialEvents,
                args.orderId
            );
            const financialEventDiagnostics = summarizeRawFinancialEvents(
                financialEvents,
                financialEventPagesFetched,
                orderTimestamp,
                args.orderId
            );

            if (
                trackedOrderState.hasFulfilledOfficialRows &&
                args.updateExisting &&
                !hasShipmentFinancialEventsForOrder
            ) {
                log.skipped = true;
                log.skippedReason =
                    "Existing fulfilled Amazon order retained because new shipment financial events are not available yet";
                log.rawFinancialEvents = financialEventDiagnostics;
                console.error(JSON.stringify(log));
                return {
                    success: true,
                    itemsProcessed: 0,
                    itemsCreated: 0,
                    itemsQueued: 0,
                    skipped: true,
                    skippedReason: log.skippedReason,
                    rawFinancialEvents: log.rawFinancialEvents,
                };
            }

            // Extract FBA fulfillment fees for FBA orders
            const { totalFBAFees, fbaFeesBySKU } = isFBA
                ? extractFBAFeesFromShipmentLikeEvents(shipmentLikeEvents)
                : { totalFBAFees: 0, fbaFeesBySKU: {} as Record<string, number> };

            // Calculate total shipping based on fulfillment channel
            // Note: Amazon uses negative values to represent debits (costs)
            // We need to convert negative values to positive for our cost calculations
            let shippingInsurance = 0;
            
            if (isFBA) {
                // For FBA orders, use FBA fulfillment fees as shipping cost
                rawTotalOrderShipping = totalFBAFees;
                shippingInsurance = 0; // FBA doesn't have separate insurance
            } else {
                // For FBM orders, extract shipping from AdjustmentEventList
                if (financialEvents?.AdjustmentEventList) {
                    for (const adjustment of financialEvents.AdjustmentEventList as AmazonAdjustmentEvent[]) {
                        const adjustmentType = adjustment.AdjustmentType || "";
                        const adjustmentAmount = parseFloat(
                            (adjustment.AdjustmentAmount?.CurrencyAmount ||
                                "0") as string
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
            }
            
            // Calculate total shipping including insurance (now both are positive)
            const totalShippingWithInsurance = rawTotalOrderShipping + shippingInsurance;
            
            // Log raw financial events for debugging
            log.rawFinancialEvents = financialEventDiagnostics;
            
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
            let {
                fulfillmentTimestamp,
                fulfillmentDate,
                fulfillmentSourceList,
            } = extractFulfillmentFromShipmentLikeEvents(shipmentLikeEvents);

            if (!fulfillmentTimestamp && !isFBA) {
                const adjustmentFulfillment =
                    extractFulfillmentFromAdjustmentEvents({
                        adjustmentEvents:
                            financialEvents?.AdjustmentEventList as
                                | AmazonAdjustmentEvent[]
                                | undefined,
                        orderTimestamp,
                    });
                if (adjustmentFulfillment.fulfillmentTimestamp) {
                    fulfillmentTimestamp =
                        adjustmentFulfillment.fulfillmentTimestamp;
                    fulfillmentDate = adjustmentFulfillment.fulfillmentDate;
                    fulfillmentSourceList =
                        adjustmentFulfillment.fulfillmentSourceList;
                }
            }

            if (!fulfillmentTimestamp) {
                try {
                    const packageFulfillment =
                        await fetchFulfillmentFromOrderPackages({
                            spApi,
                            orderId: args.orderId,
                            orderTimestamp,
                        });
                    if (packageFulfillment.fulfillmentTimestamp) {
                        fulfillmentTimestamp =
                            packageFulfillment.fulfillmentTimestamp;
                        fulfillmentDate = packageFulfillment.fulfillmentDate;
                        fulfillmentSourceList =
                            packageFulfillment.fulfillmentSourceList;
                    }
                } catch (error: unknown) {
                    log.errors.push({
                        step: "fetch_order_package_ship_time",
                        error: caughtErrorMessage(error),
                        timestamp: new Date().toISOString(),
                    });
                }
            }
            
            if (fulfillmentTimestamp) {
                log.fulfillmentData = {
                    fulfillmentTimestamp: fulfillmentTimestamp,
                    fulfillmentDate: fulfillmentDate,
                    sourceList: fulfillmentSourceList,
                };
            }

            // Calculate total quantity across all items
            const totalQuantity = orderItems.reduce(
                (sum: number, item: AmazonOrderItem) => {
                    return sum + parseInt((item.QuantityOrdered || "1") as string);
                },
                0
            );
            log.summary.totalQuantity = totalQuantity;

            // Use total shipping including insurance for calculations
            // After converting negative debits to positive, totalShippingWithInsurance should always be >= 0
            const totalOrderShipping = totalShippingWithInsurance;
            
            // For FBM orders, split shipping evenly across all units
            // For FBA orders, we'll calculate per-item shipping in the loop below
            const { shippingPerUnit: defaultShippingPerUnit, buyerPaidPerUnit: buyerPaidShippingPerUnit } =
                totalQuantity > 0
                    ? splitOrderCosts({
                          totalShipping: totalOrderShipping,
                          totalBuyerPaid: totalBuyerPaidShipping,
                          totalQty: totalQuantity,
                      })
                    : { shippingPerUnit: 0, buyerPaidPerUnit: 0 };

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
                status?: "official" | "pending";
                reasonCode?: string;
                reasonMessage?: string;
                feeSourceLists?: string[];
            }> = [];
            
            const attemptTimestamp = Date.now();
            for (const item of orderItems) {
                const price = parseFloat(
                    (item.ItemPrice?.Amount || "0") as string
                );
                if (price === 0) {
                    continue;
                }
                const quantity = parseInt(
                    (item.QuantityOrdered || "1") as string
                );

                // Get actual fees from financial events
                const {
                    actualFees: extractedActualFees,
                    feesBreakdown,
                    feeSourceLists,
                } = extractItemFeesFromShipmentLikeEvents({
                    shipmentLikeEvents,
                    sellerSKU: item.SellerSKU,
                    isFBA,
                });
                let actualFees = extractedActualFees;

                // If we didn't get financial data, fall back to estimates
                const usedEstimatedFees = actualFees === 0;
                if (usedEstimatedFees) {
                    actualFees = price * AMAZON_ESTIMATED_FEE_RATE;
                    feesBreakdown.push([AMAZON_ESTIMATED_FEE_LABEL, actualFees]);
                }

                // Divide fees and price by quantity to get per-unit values
                const feesPerUnit = actualFees / quantity;
                const pricePerUnit = price / quantity;
                const feesBreakdownPerUnit =
                    toPerUnitBreakdown(feesBreakdown, quantity) ?? [];

                // Calculate shipping per unit for this item
                let shippingPerUnit = defaultShippingPerUnit;
                
                if (isFBA) {
                    // For FBA orders, use item-specific FBA fees per unit
                    const itemFBAFees = fbaFeesBySKU[item.SellerSKU] || 0;
                    if (itemFBAFees > 0 && quantity > 0) {
                        shippingPerUnit = itemFBAFees / quantity;
                    } else if (totalFBAFees > 0 && totalQuantity > 0) {
                        // Fallback: split total FBA fees proportionally if item-specific fees not found
                        shippingPerUnit = totalFBAFees / totalQuantity;
                    }
                }
                
                // Create shipping breakdown based on fulfillment channel
                const shippingBreakdown: Array<[string, number]> = [];
                
                if (isFBA) {
                    // For FBA orders, show FBA Logistics breakdown
                    if (shippingPerUnit > 0) {
                        shippingBreakdown.push(["FBA Logistics", shippingPerUnit]);
                    }
                } else {
                    // For FBM orders, use existing breakdown (base shipping + insurance)
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
                }

                // Don't update message here - let the main sync loop handle it

                // Calculate shipping percentage (what % of total order shipping this unit represents)
                // Only show percentage if shipping is split across multiple items (not 100%)
                const averageShippingPerUnit = totalOrderShipping > 0 && totalQuantity > 0 
                    ? totalOrderShipping / totalQuantity 
                    : 0;
                const shippingPercentage =
                    averageShippingPerUnit > 0 && totalQuantity > 1
                        ? (shippingPerUnit / averageShippingPerUnit) * 100
                        : totalQuantity === 1 ? 100 : undefined;

                const missingFulfillmentDate = !fulfillmentTimestamp;
                const hasValidatedAdjustmentFulfillment =
                    Boolean(fulfillmentTimestamp) &&
                    fulfillmentSourceList?.startsWith("AdjustmentEventList:") ===
                        true;
                const hasShipmentEvidenceForPromotion =
                    hasShipmentFinancialEventsForOrder ||
                    hasValidatedAdjustmentFulfillment;
                const shouldQueuePendingImport =
                    !hasShipmentEvidenceForPromotion ||
                    missingFulfillmentDate ||
                    (usedEstimatedFees && !hasValidatedAdjustmentFulfillment);
                const hasFallbackShipmentFinanceOnly =
                    hasShipmentFinancialEventsForOrder &&
                    !financialEventDiagnostics.hasShipmentEventList;
                const pendingImportReason = shouldQueuePendingImport
                    ? getPendingImportReason({
                          financeStatusClassification:
                              financialEventDiagnostics.financeStatusClassification,
                          suggestFinancesV2024Fallback:
                              financialEventDiagnostics.suggestFinancesV2024Fallback,
                          hasShipmentFinancialEvents:
                              hasShipmentFinancialEventsForOrder,
                          hasFallbackShipmentFinanceOnly,
                          usedEstimatedFees,
                          missingFulfillmentDate,
                      })
                    : undefined;

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
                    status: shouldQueuePendingImport ? "pending" : "official",
                    reasonCode: pendingImportReason?.reasonCode,
                    reasonMessage: pendingImportReason?.reasonMessage,
                    feeSourceLists,
                });

                if (shouldQueuePendingImport) {
                    await ctx.runMutation(
                        internal.products.upsertPendingMarketplaceImport,
                        {
                            userId: args.userId,
                            marketplace: "Amazon",
                            sku: item.SellerSKU,
                            name: item.Title,
                            quantity,
                            price: pricePerUnit,
                            fees: feesPerUnit,
                            fees_breakdown: feesBreakdownPerUnit,
                            shipping: shippingPerUnit,
                            shipping_breakdown:
                                shippingBreakdown.length > 0
                                    ? shippingBreakdown
                                    : undefined,
                            shippingPercentage,
                            buyerPaidShipping: buyerPaidShippingPerUnit,
                            orderTimestamp,
                            fulfillmentTimestamp,
                            orderId: args.orderId,
                            reasonCode: pendingImportReason!.reasonCode,
                            reasonMessage: pendingImportReason!.reasonMessage,
                            rawFinancialEventsStatus: {
                                financeStatusClassification:
                                    financialEventDiagnostics.financeStatusClassification,
                                suggestFinancesV2024Fallback:
                                    financialEventDiagnostics.suggestFinancesV2024Fallback,
                                pagesFetched: financialEventPagesFetched,
                                usedEstimatedFees,
                                missingFulfillmentDate,
                            },
                            lastAttemptAt: attemptTimestamp,
                        }
                    );
                    log.summary.itemsQueued++;
                    log.summary.itemsProcessed++;
                    continue;
                }

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
                            updateExisting: args.updateExisting ?? false,
                        }
                    );
                    log.summary.itemsCreated++;
                }
                log.summary.itemsProcessed++;
            }

            log.items = logItems;
            console.error(JSON.stringify(log));
            return {
                success: true,
                itemsProcessed: orderItems.length,
                itemsCreated: log.summary.itemsCreated,
                itemsQueued: log.summary.itemsQueued,
                skipped: false,
                skippedReason: undefined,
                rawFinancialEvents: log.rawFinancialEvents,
            };
        } catch (error: unknown) {
            log.errors.push({
                step: "process_order",
                error: caughtErrorMessage(error),
                timestamp: new Date().toISOString(),
            });
            console.error(JSON.stringify(log));
            throw error;
        }
    },
});
