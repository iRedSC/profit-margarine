"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
    EBAY_ESTIMATED_FEE_LABEL,
    EBAY_ESTIMATED_FEE_RATE,
    EBAY_FEE_CAP_RATE,
    splitOrderCosts,
    toPerUnitBreakdown,
} from "../lib/orderCosts";
import { getErrorMessage } from "../marketplaceUtils";
import {
    ebayTransactionValidator,
    isRecord,
    parseEbayAmount,
    transactionBelongsToOrder,
} from "./transactions";

type EbayOrderLineItem = {
    lineItemId?: unknown;
    sku?: unknown;
    title?: unknown;
    quantity?: unknown;
    lineItemCost?: unknown;
};

type EbayFulfillment = {
    shippedDate?: unknown;
};

type EbayOrderResponse = {
    creationDate?: unknown;
    lineItems?: unknown;
    pricingSummary?: unknown;
};

function asOrderLineItems(value: unknown): EbayOrderLineItem[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const lineItems: EbayOrderLineItem[] = [];
    for (const item of value) {
        if (isRecord(item)) {
            lineItems.push(item);
        }
    }
    return lineItems;
}

function asFulfillments(value: unknown): EbayFulfillment[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const fulfillments: EbayFulfillment[] = [];
    for (const item of value) {
        if (isRecord(item)) {
            fulfillments.push(item);
        }
    }
    return fulfillments;
}

function parseEbayQuantity(value: unknown): number {
    if (typeof value === "string" || typeof value === "number") {
        return parseInt(String(value || "1"));
    }
    return parseInt("1");
}

function asDisplayString(value: unknown, fallback = ""): string {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number") {
        return String(value);
    }
    return fallback;
}

function asRecordKey(value: unknown): string {
    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint" ||
        value == null
    ) {
        return String(value);
    }
    return "";
}

function toDate(value: unknown): Date {
    if (typeof value === "string" || typeof value === "number") {
        return new Date(value);
    }
    return new Date(NaN);
}

export const processEbayOrder = internalAction({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        shippingCost: v.number(),
        accessToken: v.string(),
        allTransactions: v.array(ebayTransactionValidator),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const log: {
            operation: string;
            orderId: string;
            userId: string;
            updateExisting: boolean;
            timestamp: string;
            environment: string;
            orderData?: {
                orderDate?: string;
                orderTimestamp?: number;
                orderExists?: boolean;
                lineItemsCount?: number;
            };
            shippingData?: {
                rawShippingCost: number;
                shippingInsurance: number;
                totalShippingWithInsurance: number;
                buyerPaidShipping: number;
                shippingPerUnit: number;
                buyerPaidShippingPerUnit: number;
            };
            fulfillmentData?: {
                fulfillmentTimestamp?: number;
                fulfillmentDate?: string;
            };
            feesData?: {
                totalFees: number;
                orderLevelFees: number;
                feesByLineItem?: Record<string, number>;
            };
            items?: Array<{
                lineItemId: string;
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
            operation: "process_ebay_order",
            orderId: args.orderId,
            userId: args.userId,
            updateExisting: args.updateExisting ?? false,
            timestamp: new Date().toISOString(),
            environment: process.env.EBAY_SANDBOX === "true" ? "sandbox" : "production",
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
            const isSandbox = process.env.EBAY_SANDBOX === "true";
            const baseUrl = isSandbox
                ? "https://api.sandbox.ebay.com"
                : "https://api.ebay.com";
            const orderUrl = `${baseUrl}/sell/fulfillment/v1/order/${args.orderId}`;

            const orderResponse = await fetch(orderUrl, {
                headers: {
                    Authorization: `Bearer ${args.accessToken}`,
                    "Content-Type": "application/json",
                },
            });

            if (!orderResponse.ok) {
                throw new Error(
                    `Failed to fetch eBay order ${args.orderId}: ${orderResponse.status}`
                );
            }

            const orderJson: unknown = await orderResponse.json();
            const orderData: EbayOrderResponse = isRecord(orderJson)
                ? orderJson
                : {};
            const lineItems = asOrderLineItems(orderData.lineItems);
            
            const orderTimestamp = new Date(
                (typeof orderData.creationDate === "string" ||
                typeof orderData.creationDate === "number"
                    ? orderData.creationDate
                    : undefined) || Date.now()
            ).getTime();
            log.orderData = {
                orderDate:
                    typeof orderData.creationDate === "string"
                        ? orderData.creationDate
                        : undefined,
                orderTimestamp: orderTimestamp,
                lineItemsCount: lineItems.length,
            };
            log.summary.totalItems = lineItems.length;

            // Fetch shipping fulfillments to get fulfillment date
            let fulfillmentTimestamp: number | undefined = undefined;
            let fulfillmentDate: string | undefined = undefined;
            try {
                const fulfillmentUrl = `${baseUrl}/sell/fulfillment/v1/order/${args.orderId}/shipping_fulfillment`;
                const fulfillmentResponse = await fetch(fulfillmentUrl, {
                    headers: {
                        Authorization: `Bearer ${args.accessToken}`,
                        "Content-Type": "application/json",
                    },
                });

                if (fulfillmentResponse.ok) {
                    const fulfillmentJson: unknown =
                        await fulfillmentResponse.json();
                    const fulfillments = asFulfillments(
                        isRecord(fulfillmentJson)
                            ? fulfillmentJson.fulfillments
                            : undefined
                    );
                    if (fulfillments.length > 0) {
                        // Get the latest fulfillment's shippedDate
                        const latestFulfillment = fulfillments.reduce<
                            EbayFulfillment | null
                        >((latest, current) => {
                            if (!latest || !latest.shippedDate) return current;
                            if (!current.shippedDate) return latest;
                            return toDate(current.shippedDate) >
                                toDate(latest.shippedDate)
                                ? current
                                : latest;
                        }, null);
                        
                        if (latestFulfillment?.shippedDate) {
                            fulfillmentTimestamp = toDate(
                                latestFulfillment.shippedDate
                            ).getTime();
                            const shippedDate = latestFulfillment.shippedDate;
                            if (typeof shippedDate === "string") {
                                fulfillmentDate = shippedDate;
                            } else if (typeof shippedDate === "number") {
                                fulfillmentDate = String(shippedDate);
                            }
                        }
                    }
                }
            } catch (error: unknown) {
                log.errors.push({
                    step: "fetch_fulfillment_date",
                    error: getErrorMessage(error),
                    timestamp: new Date().toISOString(),
                });
            }
            
            if (fulfillmentTimestamp) {
                log.fulfillmentData = {
                    fulfillmentTimestamp: fulfillmentTimestamp,
                    fulfillmentDate: fulfillmentDate,
                };
            }

            // Log all transactions for this order for debugging (after helper function is defined)
            // Note: This will be logged after the helper function is created below

            // Extract buyer paid shipping from pricingSummary
            // Buyer paid shipping = deliveryCost - deliveryDiscount
            const pricingSummary = isRecord(orderData.pricingSummary)
                ? orderData.pricingSummary
                : undefined;
            const deliveryCost = parseEbayAmount(pricingSummary?.deliveryCost);
            const deliveryDiscount = parseEbayAmount(
                pricingSummary?.deliveryDiscount
            );
            const buyerPaidShippingTotal = deliveryCost - deliveryDiscount;
            
            // Extract shipping insurance from transactions
            let shippingInsurance = 0;
            for (const transaction of args.allTransactions) {
                if (transactionBelongsToOrder(transaction, args.orderId)) {
                    const transactionType = (transaction.transactionType || "").toUpperCase();
                    
                    // Check for separate insurance transaction
                    if (
                        transactionType === "SHIPPING_INSURANCE" ||
                        transactionType === "INSURANCE" ||
                        (transactionType.includes("INSURANCE") && transactionType !== "SHIPPING_LABEL")
                    ) {
                        const amount = Math.abs(
                            parseEbayAmount(transaction.amount)
                        );
                        shippingInsurance += amount;
                    }
                    
                    // Check if SHIPPING_LABEL transaction has insurance in fees array
                    if (transactionType === "SHIPPING_LABEL") {
                        if (transaction.fees && Array.isArray(transaction.fees)) {
                            for (const fee of transaction.fees) {
                                const feeType = (fee.feeType || "").toUpperCase();
                                if (
                                    feeType.includes("INSURANCE") ||
                                    feeType.includes("SHIPCOVER") ||
                                    feeType.includes("COVERAGE")
                                ) {
                                    const insuranceAmount = Math.abs(
                                        parseEbayAmount(fee.amount)
                                    );
                                    shippingInsurance += insuranceAmount;
                                }
                            }
                        }
                        
                        // Check for insurance in additional fields (if API provides them)
                        if (transaction.insuranceAmount) {
                            const insuranceAmount = Math.abs(
                                parseEbayAmount(transaction.insuranceAmount)
                            );
                            shippingInsurance += insuranceAmount;
                        }
                    }
                }
            }
            
            // Calculate total shipping including insurance
            const totalShippingWithInsurance = args.shippingCost + shippingInsurance;
            
            log.shippingData = {
                rawShippingCost: args.shippingCost,
                shippingInsurance: shippingInsurance,
                totalShippingWithInsurance: totalShippingWithInsurance,
                buyerPaidShipping: buyerPaidShippingTotal,
                shippingPerUnit: 0, // Will be calculated below
                buyerPaidShippingPerUnit: 0, // Will be calculated below
            };

            const feesByLineItemId: Record<string, number> = {};
            const feesBreakdownByLineItemId: Record<string, Array<[string, number]>> = {};
            let totalOrderLevelFees = 0; // Accumulate order-level fees to distribute later
            const processedTransactionIds = new Set<string>(); // Track processed transactions to avoid double-counting

            // Helper function to check if a fee or transaction is tax-related
            const isTaxFee = (
                feeType: string,
                transactionType?: string
            ): boolean => {
                const upperFeeType = (feeType || "").toUpperCase();
                const upperTransactionType = (
                    transactionType || ""
                ).toUpperCase();
                return (
                    upperFeeType.includes("TAX") ||
                    upperTransactionType.includes("TAX")
                );
            };

            // First pass: collect line-item fees from marketplaceFees (most accurate source)
            for (const transaction of args.allTransactions) {
                if (transactionBelongsToOrder(transaction, args.orderId)) {
                    const transactionId =
                        transaction.transactionId ||
                        JSON.stringify(transaction);
                    const transactionType = transaction.transactionType || "";

                    // Skip tax transactions
                    if (isTaxFee("", transactionType)) {
                        continue;
                    }

                    // Process line-item fees first (most accurate)
                    if (
                        transaction.orderLineItems &&
                        Array.isArray(transaction.orderLineItems) &&
                        transaction.orderLineItems.length > 0
                    ) {
                        processedTransactionIds.add(transactionId);
                        for (const lineOrderItem of transaction.orderLineItems) {
                            const lineItemId = lineOrderItem.lineItemId;

                            // Sum up all marketplace fees for this line item (excluding tax)
                            let totalFees = 0;
                            const feeDetails: Array<{
                                type: string;
                                amount: number;
                            }> = [];
                            if (
                                lineOrderItem.marketplaceFees &&
                                Array.isArray(lineOrderItem.marketplaceFees)
                            ) {
                                for (const fee of lineOrderItem.marketplaceFees) {
                                    const feeType = fee.feeType || "";
                                    // Skip tax fees
                                    if (isTaxFee(feeType)) {
                                        continue;
                                    }

                                    const feeAmount = Math.abs(
                                        parseEbayAmount(fee.amount)
                                    );
                                    totalFees += feeAmount;
                                    feeDetails.push({
                                        type: feeType,
                                        amount: feeAmount,
                                    });
                                }
                            }

                            // Log fee details for this line item
                            if (feeDetails.length > 0) {
                                console.log(
                                    `[eBay Fees] Order ${args.orderId}, LineItem ${lineItemId}: Found ${feeDetails.length} fee(s):`,
                                    JSON.stringify(feeDetails, null, 2)
                                );
                            }

                            if (lineItemId && totalFees > 0) {
                                feesByLineItemId[lineItemId] =
                                    (feesByLineItemId[lineItemId] || 0) +
                                    totalFees;
                                
                                // Store fee breakdown for this line item
                                if (!feesBreakdownByLineItemId[lineItemId]) {
                                    feesBreakdownByLineItemId[lineItemId] = [];
                                }
                                for (const feeDetail of feeDetails) {
                                    feesBreakdownByLineItemId[lineItemId].push([
                                        feeDetail.type,
                                        feeDetail.amount,
                                    ]);
                                }
                            }
                        }
                    }
                }
            }

            // Second pass: collect ALL fees from transactions (including order-level fees)
            // This captures fees that might not be in marketplaceFees or are order-level
            for (const transaction of args.allTransactions) {
                if (transactionBelongsToOrder(transaction, args.orderId)) {
                    const transactionId =
                        transaction.transactionId ||
                        JSON.stringify(transaction);
                    const transactionType = transaction.transactionType || "";
                    const transactionMemo = transaction.transactionMemo || "";

                    // Skip tax transactions (check both type and memo)
                    if (
                        isTaxFee("", transactionType) ||
                        isTaxFee("", transactionMemo)
                    ) {
                        continue;
                    }

                    // Skip shipping label transactions (handled separately)
                    if (transactionType === "SHIPPING_LABEL") {
                        continue;
                    }

                    // Skip if this transaction was already fully processed in first pass
                    // (i.e., it had orderLineItems with marketplaceFees)
                    const hasProcessedLineItems =
                        processedTransactionIds.has(transactionId) &&
                        transaction.orderLineItems &&
                        Array.isArray(transaction.orderLineItems) &&
                        transaction.orderLineItems.length > 0;

                    let orderLevelFee = 0;

                    // For transactions with orderLineItems that we already processed:
                    // Check for additional order-level fees at the transaction level
                    // Note: We skip totalFeeAmount here because it often includes line-item fees we already counted
                    if (hasProcessedLineItems) {
                        // Check for fees array at transaction level (separate from marketplaceFees)
                        if (
                            transaction.fees &&
                            Array.isArray(transaction.fees)
                        ) {
                            for (const fee of transaction.fees) {
                                const feeType = fee.feeType || "";
                                if (isTaxFee(feeType)) {
                                    continue;
                                }
                                const feeAmount = Math.abs(
                                    parseEbayAmount(fee.amount)
                                );
                                orderLevelFee += feeAmount;
                            }
                        }
                    } else {
                        // For transactions without orderLineItems (or not yet processed):
                        // Collect all fees from this transaction

                        // Check for transaction-level fees
                        if (transaction.totalFeeAmount) {
                            const transactionFee = Math.abs(
                                parseEbayAmount(transaction.totalFeeAmount)
                            );
                            orderLevelFee += transactionFee;
                        }

                        // Check for fees at the transaction level (feeJurisdiction indicates a fee transaction)
                        if (transaction.feeJurisdiction) {
                            const feeAmount = Math.abs(
                                parseEbayAmount(transaction.amount)
                            );
                            orderLevelFee += feeAmount;
                        }

                        // Check for NON_SALE_CHARGE transactions (like ad fees, promoted listings)
                        // These are separate fee transactions tied to the order
                        if (
                            transactionType === "NON_SALE_CHARGE" ||
                            transactionType === "AD" ||
                            transactionType.includes("FEE")
                        ) {
                            const amount = parseEbayAmount(transaction.amount);
                            if (amount !== 0) {
                                orderLevelFee += Math.abs(amount);
                            }
                        }

                        // Check transaction amount if it's a fee transaction (negative amount typically indicates a fee)
                        if (
                            transaction.amount &&
                            !transaction.feeJurisdiction &&
                            !transaction.totalFeeAmount
                        ) {
                            const amount = parseEbayAmount(transaction.amount);
                            // Negative amounts are typically fees/charges
                            if (amount < 0) {
                                orderLevelFee += Math.abs(amount);
                            }
                        }

                        // Check for fees array at transaction level (if it exists)
                        if (
                            transaction.fees &&
                            Array.isArray(transaction.fees)
                        ) {
                            for (const fee of transaction.fees) {
                                const feeType = fee.feeType || "";
                                if (isTaxFee(feeType)) {
                                    continue;
                                }
                                const feeAmount = Math.abs(
                                    parseEbayAmount(fee.amount)
                                );
                                orderLevelFee += feeAmount;
                            }
                        }

                        // Mark as processed
                        processedTransactionIds.add(transactionId);
                    }

                    if (orderLevelFee > 0) {
                        totalOrderLevelFees += orderLevelFee;
                        console.log(
                            `[eBay Fees] Order ${args.orderId}, Transaction ${transactionId} (${transactionType}): Found order-level fee: $${orderLevelFee.toFixed(2)}`
                        );
                    }
                }
            }

            // Distribute order-level fees evenly across all line items in the order
            if (totalOrderLevelFees > 0 && lineItems.length > 0) {
                const orderLevelFeePerLineItem =
                    totalOrderLevelFees / lineItems.length;
                for (const lineItem of lineItems) {
                    const lineItemId = asRecordKey(lineItem.lineItemId);
                    if (lineItem.lineItemId) {
                        feesByLineItemId[lineItemId] =
                            (feesByLineItemId[lineItemId] || 0) +
                            orderLevelFeePerLineItem;
                        
                        // Add order-level fee to breakdown
                        if (!feesBreakdownByLineItemId[lineItemId]) {
                            feesBreakdownByLineItemId[lineItemId] = [];
                        }
                        feesBreakdownByLineItemId[lineItemId].push([
                            "Order-Level Fee",
                            orderLevelFeePerLineItem,
                        ]);
                    }
                }
            }

            // Calculate total fees for logging (after totalOrderLevelFees is calculated and distributed)
            let totalFees = 0;
            const feesByLineItem: Record<string, number> = {};
            for (const lineItem of lineItems) {
                const lineItemId = asRecordKey(lineItem.lineItemId);
                const fees = feesByLineItemId[lineItemId] || 0;
                feesByLineItem[lineItemId] = fees;
                totalFees += fees;
            }
            
            log.feesData = {
                totalFees: totalFees,
                orderLevelFees: totalOrderLevelFees,
                feesByLineItem: feesByLineItem,
            };

            // Check if order already exists (by orderId and orderDate)
            const orderExists = await ctx.runQuery(
                internal.products.checkOrderExists,
                {
                    userId: args.userId,
                    orderId: args.orderId,
                    orderDate: orderTimestamp,
                }
            );

            if (log.orderData) {
                log.orderData.orderExists = orderExists;
            }

            if (orderExists && !args.updateExisting) {
                log.skipped = true;
                log.skippedReason = "Order already exists";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            // If updating existing order, delete all existing marketplace products for this order first
            // This ensures we recreate them all with the correct fees
            if (args.updateExisting && orderExists) {
                await ctx.runMutation(
                    internal.products.deleteMarketplaceProductsByOrder,
                    {
                        userId: args.userId,
                        orderId: args.orderId,
                        orderDate: orderTimestamp,
                    }
                );
            }

            // Calculate total quantity across all line items
            const totalQuantity = lineItems.reduce((sum, item) => {
                return sum + parseEbayQuantity(item.quantity);
            }, 0);
            log.summary.totalQuantity = totalQuantity;

            // Use total shipping including insurance for calculations
            const totalOrderShipping = totalShippingWithInsurance;

            // Split shipping evenly across all units
            const { shippingPerUnit, buyerPaidPerUnit: buyerPaidShippingPerUnit } =
                totalQuantity > 0
                    ? splitOrderCosts({
                          totalShipping: totalOrderShipping,
                          totalBuyerPaid: buyerPaidShippingTotal,
                          totalQty: totalQuantity,
                      })
                    : { shippingPerUnit: 0, buyerPaidPerUnit: 0 };
            
            if (log.shippingData) {
                log.shippingData.shippingPerUnit = shippingPerUnit;
                log.shippingData.buyerPaidShippingPerUnit = buyerPaidShippingPerUnit;
            }

            const logItems: Array<{
                lineItemId: string;
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
            
            for (const lineItem of lineItems) {
                const lineItemId = asRecordKey(lineItem.lineItemId);
                const sku =
                    asDisplayString(lineItem.sku) ||
                    asDisplayString(lineItem.lineItemId);
                const title =
                    asDisplayString(lineItem.title) || "Unknown Item";
                const price = parseEbayAmount(lineItem.lineItemCost);
                let fees = feesByLineItemId[lineItemId] || 0;
                const quantity = parseEbayQuantity(lineItem.quantity);

                // Divide by quantity to get per-unit values
                const pricePerUnit = price / quantity;
                if (pricePerUnit === 0) {
                    continue;
                }

                // Get fee breakdown for this line item
                let feesBreakdown = feesBreakdownByLineItemId[lineItemId] || [];
                
                // Fallback: if no fees found, estimate at typical eBay final value fee rate
                if (fees === 0) {
                    fees = price * EBAY_ESTIMATED_FEE_RATE;
                    feesBreakdown = [[EBAY_ESTIMATED_FEE_LABEL, fees]];
                }

                // Validation: cap fees to prevent unreasonably high fees
                // This protects against double-counting or data errors
                const maxReasonableFees = price * EBAY_FEE_CAP_RATE;
                if (fees > maxReasonableFees) {
                    const feeReductionRatio = maxReasonableFees / fees;
                    fees = maxReasonableFees;
                    // Scale down all fee breakdown amounts proportionally
                    feesBreakdown = feesBreakdown.map(([type, amount]) => [
                        type,
                        amount * feeReductionRatio,
                    ]);
                }

                const feesPerUnit = fees / quantity;
                const feesBreakdownPerUnit =
                    toPerUnitBreakdown(feesBreakdown, quantity) ?? [];

                // Create shipping breakdown (base shipping + insurance)
                const shippingBreakdown: Array<[string, number]> = [];
                const baseShippingPerUnit = (args.shippingCost / totalQuantity);
                const insurancePerUnit = (shippingInsurance / totalQuantity);
                
                if (baseShippingPerUnit > 0 || insurancePerUnit > 0) {
                    if (baseShippingPerUnit > 0) {
                        shippingBreakdown.push(["Base Shipping", baseShippingPerUnit]);
                    }
                    if (insurancePerUnit > 0) {
                        shippingBreakdown.push(["Shipping Insurance", insurancePerUnit]);
                    }
                }

                // Calculate shipping percentage (what % of total order shipping this unit represents)
                const shippingPercentage =
                    totalOrderShipping > 0
                        ? (shippingPerUnit / totalOrderShipping) * 100
                        : 0;

                // Store item data in log before processing
                logItems.push({
                    lineItemId: lineItemId,
                    sku: sku,
                    title: title,
                    quantity: quantity,
                    price: price,
                    pricePerUnit: pricePerUnit,
                    fees: fees,
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
                            marketplace: "Ebay",
                            sku,
                            name: title,
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
            return { success: true, itemsProcessed: lineItems.length };
        } catch (error: unknown) {
            log.errors.push({
                step: "process_order",
                error: getErrorMessage(error),
                timestamp: new Date().toISOString(),
            });
            console.error(JSON.stringify(log));
            throw error;
        }
    },
});
