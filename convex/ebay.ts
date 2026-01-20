"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
    generateMonthlyBatches,
    updateSyncProgress,
    handleSyncError,
    processWithProgress,
    isSyncCanceled,
    validateSyncActive,
} from "./marketplaceUtils";
import { finishSync } from "./marketplaceUtils";
import { SyncMessages } from "./syncMessages";

async function getEbayAccessToken(
    ctx: any,
    userId: Id<"users">
): Promise<string> {
    // Try to get token from database first (OAuth)
    const connection = await ctx.runQuery(
        internal.marketplaceConnections.getMarketplaceConnection,
        {
            userId,
            marketplace: "ebay",
        }
    );

    if (connection && connection.accessToken) {
        // Check if token is expired
        if (connection.expiresAt && connection.expiresAt < Date.now()) {
            // Refresh the token
            const refreshed = await ctx.runAction(
                internal.ebayOAuth.refreshAccessToken,
                {
                    userId,
                }
            );
            return refreshed.accessToken;
        }
        return connection.accessToken;
    }

    // Fallback to environment variable for backward compatibility
    const oauthToken = process.env.EBAY_OAUTH_TOKEN;
    if (oauthToken) {
        return oauthToken;
    }

    throw new Error(
        "eBay not connected. Please connect your eBay account first."
    );
}

export const getEbayAccessTokenForResync = internalAction({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        return await getEbayAccessToken(ctx, args.userId);
    },
});

export const getTransactionsForOrder = internalAction({
    args: {
        orderId: v.string(),
        accessToken: v.string(),
        orderDate: v.optional(v.number()), // Optional order date to help narrow search
    },
    handler: async (ctx, args) => {
        const isSandbox = process.env.EBAY_SANDBOX === "true";
        const baseUrl = isSandbox
            ? "https://apiz.sandbox.ebay.com"
            : "https://apiz.ebay.com";

        // Calculate start date - use order date if provided, otherwise go back 180 days
        const startDate = args.orderDate
            ? new Date(args.orderDate - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days before order
            : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(); // 180 days back

        const allTransactions: any[] = [];
        let hasNext = true;
        let offset = 0;
        const limit = 200;

        // Paginate through all transactions to find all for this order
        while (hasNext) {
            const transactionsUrl = new URL(
                `${baseUrl}/sell/finances/v1/transaction`
            );
            transactionsUrl.searchParams.set("limit", limit.toString());
            transactionsUrl.searchParams.set("offset", offset.toString());
            transactionsUrl.searchParams.set(
                "filter",
                `transactionDate:[${startDate}..]`
            );

            const transactionsResponse = await fetch(
                transactionsUrl.toString(),
                {
                    headers: {
                        Authorization: `Bearer ${args.accessToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!transactionsResponse.ok) {
                throw new Error(
                    `Failed to fetch eBay transactions: ${transactionsResponse.status}`
                );
            }

            const transactionsData = await transactionsResponse.json();
            const transactions = transactionsData.transactions || [];

            // Filter transactions for this specific order
            // Note: Some transactions (like ad fees) use references array instead of orderId field
            const orderTransactions = transactions.filter((t: any) => {
                // Check direct orderId field
                if (t.orderId === args.orderId) {
                    return true;
                }
                // Check references array for ORDER_ID reference
                if (t.references && Array.isArray(t.references)) {
                    return t.references.some(
                        (ref: any) =>
                            ref.referenceType === "ORDER_ID" &&
                            ref.referenceId === args.orderId
                    );
                }
                return false;
            });

            // Log transaction API response for debugging
            if (orderTransactions.length > 0) {
                console.log(
                    `[eBay Transactions API] Order ${args.orderId} - Found ${orderTransactions.length} transaction(s):`
                );
                console.log(JSON.stringify(orderTransactions, null, 2));
            }

            allTransactions.push(...orderTransactions);

            // Check if we need to paginate
            if (transactions.length < limit) {
                hasNext = false;
            } else {
                offset += limit;
                // Safety check: if we've found transactions for this order and we're getting further from the order date, we can stop
                if (orderTransactions.length > 0 && args.orderDate) {
                    const lastTransactionDate = new Date(
                        transactions[transactions.length - 1].transactionDate ||
                            0
                    ).getTime();
                    // If we're more than 30 days past the order date, stop searching
                    if (
                        lastTransactionDate <
                        args.orderDate - 30 * 24 * 60 * 60 * 1000
                    ) {
                        hasNext = false;
                    }
                }
            }
        }

        return allTransactions;
    },
});

export const getShippingCostForOrder = internalAction({
    args: {
        orderId: v.string(),
        accessToken: v.string(),
        orderDate: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        // Get all transactions for this order
        const transactions = await ctx.runAction(
            internal.ebay.getTransactionsForOrder,
            {
                orderId: args.orderId,
                accessToken: args.accessToken,
                orderDate: args.orderDate,
            }
        );

        // Find shipping label transactions
        const shippingTransactions = transactions.filter(
            (t: any) => t.transactionType === "SHIPPING_LABEL"
        );

        // Sum up all shipping costs for this order
        let totalShipping = 0;
        let totalInsurance = 0;
        
        for (const transaction of shippingTransactions) {
            const shippingAmount = Math.abs(
                parseFloat(transaction.amount?.value || "0")
            );
            totalShipping += shippingAmount;
            
            // Check for insurance in transaction fees array
            if (transaction.fees && Array.isArray(transaction.fees)) {
                for (const fee of transaction.fees) {
                    const feeType = (fee.feeType || "").toUpperCase();
                    if (
                        feeType.includes("INSURANCE") ||
                        feeType.includes("SHIPCOVER") ||
                        feeType.includes("COVERAGE")
                    ) {
                        const insuranceAmount = Math.abs(
                            parseFloat(fee.amount?.value || "0")
                        );
                        totalInsurance += insuranceAmount;
                    }
                }
            }
            
            // Check for insurance in additional fields (if API provides them)
            if (transaction.insuranceAmount) {
                const insuranceAmount = Math.abs(
                    parseFloat(transaction.insuranceAmount?.value || "0")
                );
                totalInsurance += insuranceAmount;
            }
        }
        
        // Check for separate insurance transactions
        for (const transaction of transactions) {
            const transactionType = (transaction.transactionType || "").toUpperCase();
            if (
                transactionType === "SHIPPING_INSURANCE" ||
                transactionType === "INSURANCE" ||
                transactionType.includes("INSURANCE")
            ) {
                const insuranceAmount = Math.abs(
                    parseFloat(transaction.amount?.value || "0")
                );
                totalInsurance += insuranceAmount;
            }
        }

        return { shipping: totalShipping, insurance: totalInsurance };
    },
});

export const syncEbayOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            const accessToken = await getEbayAccessToken(ctx, args.userId);

            const endDate = new Date();
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);

            const batches = generateMonthlyBatches(startDate, endDate);

            const isSandbox = process.env.EBAY_SANDBOX === "true";
            const baseUrl = isSandbox
                ? "https://apiz.sandbox.ebay.com"
                : "https://apiz.ebay.com";

            const allTransactions: any[] = [];

            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                // Validate sync exists and is active before processing each batch
                await validateSyncActive(ctx, args.syncId);

                const batch = batches[batchIndex];

                await updateSyncProgress(
                    ctx,
                    args.syncId,
                    SyncMessages.fetchingBatch(
                        "ebay",
                        batchIndex + 1,
                        batches.length
                    ),
                    { current: batchIndex, total: batches.length }
                );

                const transactionsUrl = new URL(
                    `${baseUrl}/sell/finances/v1/transaction`
                );
                transactionsUrl.searchParams.set("limit", "200");
                transactionsUrl.searchParams.set("offset", "0");

                const batchStartDate = batch.start.toISOString();
                transactionsUrl.searchParams.set(
                    "filter",
                    `transactionDate:[${batchStartDate}..${batch.end.toISOString()}]`
                );

                const transactionsResponse = await fetch(
                    transactionsUrl.toString(),
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            "Content-Type": "application/json",
                        },
                    }
                );

                if (!transactionsResponse.ok) {
                    throw new Error(
                        `Failed to fetch eBay transactions: ${transactionsResponse.status}`
                    );
                }

                const transactionsData = await transactionsResponse.json();
                const transactions = transactionsData.transactions || [];
                allTransactions.push(...transactions);

                // Small delay between batches to avoid rate limiting
                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            const shippingTransactions = allTransactions.filter(
                (t: any) => t.transactionType === "SHIPPING_LABEL"
            );

            const orderIds = new Set<string>();
            const shippingCostsByOrder: Record<string, number> = {};

            for (const transaction of shippingTransactions) {
                if (transaction.orderId) {
                    orderIds.add(transaction.orderId);
                    // Accumulate shipping costs (don't overwrite - orders can have multiple shipping labels)
                    const shippingAmount = Math.abs(
                        parseFloat(transaction.amount?.value || "0")
                    );
                    shippingCostsByOrder[transaction.orderId] =
                        (shippingCostsByOrder[transaction.orderId] || 0) +
                        shippingAmount;
                }
            }

            let processedCount = 0;
            const orderIdsArray = Array.from(orderIds);

            await processWithProgress(
                ctx,
                args.syncId,
                orderIdsArray,
                async (orderId: string, _i: number) => {
                    try {
                        await ctx.runAction(internal.ebay.processEbayOrder, {
                            userId: args.userId,
                            orderId,
                            shippingCost: shippingCostsByOrder[orderId] || 0,
                            accessToken,
                            allTransactions,
                            updateExisting: args.updateExisting ?? false,
                        });
                        processedCount++;
                    } catch (error) {
                        console.error(
                            `Error processing eBay order ${orderId}:`,
                            error
                        );
                    }
                },
                "ebay"
            );

            // Validate sync exists and is active before finishing
            await validateSyncActive(ctx, args.syncId);

            await finishSync(ctx, args.syncId, "ebay");

            return { success: true, ordersProcessed: processedCount };
        } catch (error: any) {
            // Don't treat cancellation or missing sync as an error - it's expected
            if (
                error.message === "Sync was canceled" ||
                error.message === "Sync does not exist" ||
                error.message?.includes("Sync is not active")
            ) {
                return { success: false, canceled: true };
            }
            // Only handle error if sync still exists
            const syncExists = await ctx.runQuery(
                internal.products.getSyncById,
                { syncId: args.syncId }
            );
            if (syncExists) {
                await handleSyncError(ctx, args.syncId, error, "ebay");
            }
            throw error;
        }
    },
});

export const syncEbayOrders = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        daysBack: v.optional(v.number()),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            const accessToken = await getEbayAccessToken(ctx, args.userId);
            const daysBack = args.daysBack || 30;

            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("ebay"),
                { current: 0, total: 0 }
            );

            const isSandbox = process.env.EBAY_SANDBOX === "true";
            const baseUrl = isSandbox
                ? "https://apiz.sandbox.ebay.com"
                : "https://apiz.ebay.com";
            const transactionsUrl = new URL(
                `${baseUrl}/sell/finances/v1/transaction`
            );
            transactionsUrl.searchParams.set("limit", "200");
            transactionsUrl.searchParams.set("offset", "0");

            const startDate = new Date(
                Date.now() - daysBack * 24 * 60 * 60 * 1000
            ).toISOString();
            transactionsUrl.searchParams.set(
                "filter",
                `transactionDate:[${startDate}..]`
            );

            const transactionsResponse = await fetch(
                transactionsUrl.toString(),
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!transactionsResponse.ok) {
                throw new Error(
                    `Failed to fetch eBay transactions: ${transactionsResponse.status}`
                );
            }

            const transactionsData = await transactionsResponse.json();
            const transactions = transactionsData.transactions || [];

            const shippingTransactions = transactions.filter(
                (t: any) => t.transactionType === "SHIPPING_LABEL"
            );

            const orderIds = new Set<string>();
            const shippingCostsByOrder: Record<string, number> = {};

            for (const transaction of shippingTransactions) {
                if (transaction.orderId) {
                    orderIds.add(transaction.orderId);
                    // Accumulate shipping costs (don't overwrite - orders can have multiple shipping labels)
                    const shippingAmount = Math.abs(
                        parseFloat(transaction.amount?.value || "0")
                    );
                    shippingCostsByOrder[transaction.orderId] =
                        (shippingCostsByOrder[transaction.orderId] || 0) +
                        shippingAmount;
                }
            }

            let processedCount = 0;
            const orderIdsArray = Array.from(orderIds);

            await processWithProgress(
                ctx,
                args.syncId,
                orderIdsArray,
                async (orderId: string, _i: number) => {
                    try {
                        await ctx.runAction(internal.ebay.processEbayOrder, {
                            userId: args.userId,
                            orderId,
                            shippingCost: shippingCostsByOrder[orderId] || 0,
                            accessToken,
                            allTransactions: transactions,
                            updateExisting: args.updateExisting ?? false,
                        });
                        processedCount++;
                    } catch (error) {
                        console.error(
                            `Error processing eBay order ${orderId}:`,
                            error
                        );
                    }
                },
                "ebay"
            );

            // Validate sync exists and is active before finishing
            await validateSyncActive(ctx, args.syncId);

            await finishSync(ctx, args.syncId, "ebay");

            return { success: true, ordersProcessed: processedCount };
        } catch (error: any) {
            // Don't treat cancellation or missing sync as an error - it's expected
            if (
                error.message === "Sync was canceled" ||
                error.message === "Sync does not exist" ||
                error.message?.includes("Sync is not active")
            ) {
                return { success: false, canceled: true };
            }
            // Only handle error if sync still exists
            const syncExists = await ctx.runQuery(
                internal.products.getSyncById,
                { syncId: args.syncId }
            );
            if (syncExists) {
                await handleSyncError(ctx, args.syncId, error, "ebay");
            }
            throw error;
        }
    },
});

export const processEbayOrder = internalAction({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        shippingCost: v.number(),
        accessToken: v.string(),
        allTransactions: v.any(),
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

            const orderData = await orderResponse.json();
            const lineItems = orderData.lineItems || [];
            
            const orderTimestamp = new Date(orderData.creationDate || Date.now()).getTime();
            log.orderData = {
                orderDate: orderData.creationDate,
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
                    const fulfillmentData = await fulfillmentResponse.json();
                    const fulfillments = fulfillmentData.fulfillments || [];
                    if (fulfillments.length > 0) {
                        // Get the latest fulfillment's shippedDate
                        const latestFulfillment = fulfillments.reduce((latest: any, current: any) => {
                            if (!latest || !latest.shippedDate) return current;
                            if (!current.shippedDate) return latest;
                            return new Date(current.shippedDate) > new Date(latest.shippedDate) 
                                ? current 
                                : latest;
                        }, null);
                        
                        if (latestFulfillment?.shippedDate) {
                            fulfillmentTimestamp = new Date(latestFulfillment.shippedDate).getTime();
                            fulfillmentDate = latestFulfillment.shippedDate;
                        }
                    }
                }
            } catch (error: any) {
                log.errors.push({
                    step: "fetch_fulfillment_date",
                    error: error.message || String(error),
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
            const deliveryCost = parseFloat(
                orderData.pricingSummary?.deliveryCost?.value || "0"
            );
            const deliveryDiscount = parseFloat(
                orderData.pricingSummary?.deliveryDiscount?.value || "0"
            );
            const buyerPaidShippingTotal = deliveryCost - deliveryDiscount;
            
            // Helper function to check if a transaction belongs to this order
            const transactionBelongsToOrder = (transaction: any): boolean => {
                // Check direct orderId field
                if (transaction.orderId === args.orderId) {
                    return true;
                }
                // Check references array for ORDER_ID reference
                if (
                    transaction.references &&
                    Array.isArray(transaction.references)
                ) {
                    return transaction.references.some(
                        (ref: any) =>
                            ref.referenceType === "ORDER_ID" &&
                            ref.referenceId === args.orderId
                    );
                }
                return false;
            };
            
            // Extract shipping insurance from transactions
            let shippingInsurance = 0;
            for (const transaction of args.allTransactions) {
                if (transactionBelongsToOrder(transaction)) {
                    const transactionType = (transaction.transactionType || "").toUpperCase();
                    
                    // Check for separate insurance transaction
                    if (
                        transactionType === "SHIPPING_INSURANCE" ||
                        transactionType === "INSURANCE" ||
                        (transactionType.includes("INSURANCE") && transactionType !== "SHIPPING_LABEL")
                    ) {
                        const amount = Math.abs(
                            parseFloat(transaction.amount?.value || "0")
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
                                        parseFloat(fee.amount?.value || "0")
                                    );
                                    shippingInsurance += insuranceAmount;
                                }
                            }
                        }
                        
                        // Check for insurance in additional fields (if API provides them)
                        if (transaction.insuranceAmount) {
                            const insuranceAmount = Math.abs(
                                parseFloat(transaction.insuranceAmount?.value || "0")
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
                if (transactionBelongsToOrder(transaction)) {
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
                                        parseFloat(fee.amount?.value || "0")
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
                if (transactionBelongsToOrder(transaction)) {
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
                                    parseFloat(fee.amount?.value || "0")
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
                                parseFloat(
                                    transaction.totalFeeAmount?.value || "0"
                                )
                            );
                            orderLevelFee += transactionFee;
                        }

                        // Check for fees at the transaction level (feeJurisdiction indicates a fee transaction)
                        if (transaction.feeJurisdiction) {
                            const feeAmount = Math.abs(
                                parseFloat(transaction.amount?.value || "0")
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
                            const amount = parseFloat(
                                transaction.amount?.value || "0"
                            );
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
                            const amount = parseFloat(
                                transaction.amount?.value || "0"
                            );
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
                                    parseFloat(fee.amount?.value || "0")
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
                    const lineItemId = lineItem.lineItemId;
                    if (lineItemId) {
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
                const lineItemId = lineItem.lineItemId;
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
            const totalQuantity = lineItems.reduce((sum: number, item: any) => {
                return sum + parseInt(item.quantity || "1");
            }, 0);
            log.summary.totalQuantity = totalQuantity;

            // Use total shipping including insurance for calculations
            const totalOrderShipping = totalShippingWithInsurance;

            // Split shipping evenly across all units
            const shippingPerUnit =
                totalQuantity > 0 ? totalOrderShipping / totalQuantity : 0;

            // Split buyer paid shipping evenly across all units (using same shippingPercentage)
            const buyerPaidShippingPerUnit =
                totalQuantity > 0 ? buyerPaidShippingTotal / totalQuantity : 0;
            
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
                const sku = lineItem.sku || lineItem.lineItemId;
                const title = lineItem.title || "Unknown Item";
                const lineItemId = lineItem.lineItemId;
                const price = parseFloat(lineItem.lineItemCost?.value || "0");
                let fees = feesByLineItemId[lineItemId] || 0;
                const quantity = parseInt(lineItem.quantity || "1");

                // Divide by quantity to get per-unit values
                const pricePerUnit = price / quantity;
                if (pricePerUnit === 0) {
                    continue;
                }

                // Get fee breakdown for this line item
                let feesBreakdown = feesBreakdownByLineItemId[lineItemId] || [];
                
                // Fallback: if no fees found, estimate at 13.25% (typical eBay final value fee)
                // This matches eBay's standard fee structure for most categories
                if (fees === 0) {
                    fees = price * 0.1325;
                    feesBreakdown = [["Final Value Fee (Estimated)", fees]];
                }

                // Validation: cap fees at 25% of price to prevent unreasonably high fees
                // This protects against double-counting or data errors
                const maxReasonableFees = price * 0.25;
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
                // Divide fee breakdown by quantity to get per-unit values
                const feesBreakdownPerUnit = feesBreakdown.map(([type, amount]) => [
                    type,
                    amount / quantity,
                ]);

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
            return { success: true, itemsProcessed: lineItems.length };
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
