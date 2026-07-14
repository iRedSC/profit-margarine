"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

export async function getEbayAccessToken(
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
