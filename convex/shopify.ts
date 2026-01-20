"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
    generateMonthlyBatches,
    updateSyncProgress,
    handleSyncError,
    processWithProgress,
    validateSyncActive,
} from "./marketplaceUtils";
import { finishSync } from "./marketplaceSync";
import { SyncMessages } from "./syncMessages";

async function fetchShopifyGraphQL(
    query: string,
    variables: any,
    shop: string,
    accessToken: string
) {
    const endpoint = `https://${shop}/admin/api/2024-10/graphql.json`;

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify GraphQL error: ${res.status} ${text}`);
    }

    const json = await res.json();

    if (json.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
}

/**
 * Get total shipping cost for a Shopify order by querying order events
 * Returns the sum of all shipping label costs for the order
 */
export const getShippingCostForOrder = internalAction({
    args: {
        orderGid: v.string(),
        shop: v.string(),
        accessToken: v.string(),
    },
    handler: async (ctx, args) => {
        try {
            const orderEventsQuery = `
                query OrderEvents($orderId: ID!, $first: Int!) {
                  order(id: $orderId) {
                    id
                    events(first: $first, sortKey: CREATED_AT, reverse: false) {
                      edges {
                        node {
                          id
                          createdAt
                          message
                          ... on BasicEvent {
                            action
                          }
                        }
                      }
                    }
                  }
                }
            `;

            const data = await fetchShopifyGraphQL(
                orderEventsQuery,
                { orderId: args.orderGid, first: 250 },
                args.shop,
                args.accessToken
            );

            if (!data.order || !data.order.events) {
                return { shipping: 0, insurance: 0 };
            }

            const events = data.order.events.edges || [];
            let totalShippingCost = 0;
            let totalInsurance = 0;

            // Sum up all shipping label purchase events (excluding cancellations)
            for (const edge of events) {
                const event = edge.node;
                const message = (event.message || "").toLowerCase();

                // Look for shipping label purchase events
                // Skip if this is a cancellation/void event
                if (
                    message.includes("shipping label") &&
                    !message.includes("void") &&
                    !message.includes("cancel") &&
                    !message.includes("cancelled")
                ) {
                    const match = event.message?.match(
                        /\$([0-9]+(?:\.[0-9]{2})?)/
                    );
                    const cost = match ? parseFloat(match[1]) : null;

                    if (cost != null) {
                        totalShippingCost += cost;
                    }
                }

                // Check for separate insurance events
                if (
                    (message.includes("insurance") ||
                        message.includes("shipsurance")) &&
                    !message.includes("void") &&
                    !message.includes("cancel") &&
                    !message.includes("cancelled")
                ) {
                    const match = event.message?.match(
                        /\$([0-9]+(?:\.[0-9]{2})?)/
                    );
                    const insuranceCost = match ? parseFloat(match[1]) : null;

                    if (insuranceCost != null) {
                        totalInsurance += insuranceCost;
                    }
                }
            }

            return { shipping: totalShippingCost, insurance: totalInsurance };
        } catch (error) {
            console.error(
                `Error getting shipping cost for order ${args.orderGid}:`,
                error
            );
            // Return 0 if we can't fetch, rather than throwing
            return { shipping: 0, insurance: 0 };
        }
    },
});

/**
 * Check if a shipping label was cancelled by querying order events
 * Returns true if label was cancelled/voided, false otherwise
 */
async function isShippingLabelCancelled(
    orderGid: string,
    labelPurchaseTime: string,
    shop: string,
    accessToken: string
): Promise<boolean> {
    try {
        const orderEventsQuery = `
            query OrderEvents($orderId: ID!, $first: Int!) {
              order(id: $orderId) {
                id
                events(first: $first, sortKey: CREATED_AT, reverse: false) {
                  edges {
                    node {
                      id
                      createdAt
                      message
                      ... on BasicEvent {
                        action
                      }
                    }
                  }
                }
              }
            }
        `;

        const data = await fetchShopifyGraphQL(
            orderEventsQuery,
            { orderId: orderGid, first: 250 },
            shop,
            accessToken
        );

        if (!data.order || !data.order.events) {
            return false;
        }

        const labelPurchaseDate = new Date(labelPurchaseTime);
        const events = data.order.events.edges || [];

        // Check for cancellation/void events after the label purchase
        for (const edge of events) {
            const event = edge.node;
            const eventDate = new Date(event.createdAt);
            const message = (event.message || "").toLowerCase();

            // Only check events that occur after the label purchase
            if (eventDate > labelPurchaseDate) {
                // Check if this is a shipping label cancellation/void event
                if (
                    message.includes("shipping label") &&
                    (message.includes("void") ||
                        message.includes("cancel") ||
                        message.includes("cancelled"))
                ) {
                    return true;
                }
            }
        }

        return false;
    } catch (error) {
        // If we can't check, assume not cancelled to avoid false positives
        console.error(
            `Error checking label cancellation for order ${orderGid}:`,
            error
        );
        return false;
    }
}

export const processShopifyOrder = internalAction({
    args: {
        userId: v.id("users"),
        orderGid: v.string(),
        shippingLabelCost: v.number(),
        shop: v.string(),
        accessToken: v.string(),
        updateExisting: v.optional(v.boolean()),
        labelPurchaseTime: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const log: {
            operation: string;
            orderGid: string;
            orderId: string;
            userId: string;
            shop: string;
            updateExisting: boolean;
            timestamp: string;
            orderData?: {
                orderName?: string;
                createdAt?: string;
                cancelledAt?: string;
                orderTimestamp?: number;
                orderExists?: boolean;
                channelName?: string;
                lineItemsCount?: number;
            };
            shippingData?: {
                rawShippingLabelCost: number;
                shippingInsurance: number;
                totalShippingWithInsurance: number;
                buyerPaidShipping: number;
                shippingPerUnit: number;
                buyerPaidShippingPerUnit: number;
                wasCancelled?: boolean;
            };
            fulfillmentData?: {
                fulfillmentTimestamp?: number;
                fulfillmentDate?: string;
                fulfillmentStatus?: string;
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
            operation: "process_shopify_order",
            orderGid: args.orderGid,
            orderId: "",
            userId: args.userId,
            shop: args.shop,
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
            // Extract numeric ID from GID (gid://shopify/Order/123456)
            const orderId = args.orderGid.split("/").pop() || "";
            log.orderId = orderId;

            const query = `
        query GetOrder($id: ID!) {
          order(id: $id) {
            id
            name
            createdAt
            cancelledAt
            shippingLine {
              discountedPriceSet {
                shopMoney {
                  amount
                }
              }
            }
            channelInformation {
              channelDefinition {
                channelName
              }
            }
            fulfillments(first: 10) {
              id
              createdAt
              status
              trackingInfo {
                number
                company
              }
            }
            lineItems(first: 100) {
              edges {
                node {
                  id
                  title
                  sku
                  quantity
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      `;

            const data = await fetchShopifyGraphQL(
                query,
                { id: args.orderGid },
                args.shop,
                args.accessToken
            );
            const order = data.order;

            if (!order) {
                throw new Error(`Order not found: ${args.orderGid}`);
            }

            const orderTimestamp = new Date(order.createdAt).getTime();
            log.orderData = {
                orderName: order.name,
                createdAt: order.createdAt,
                cancelledAt: order.cancelledAt || undefined,
                orderTimestamp: orderTimestamp,
                channelName:
                    order.channelInformation?.channelDefinition?.channelName,
            };

            // Get allowed sales channels from environment variable
            const allowedChannels =
                process.env.SHOPIFY_ALLOWED_CHANNELS?.split(",").map((c) =>
                    c.trim().toLowerCase()
                ) || [];

            // If channels are configured, check if this order is from an allowed channel
            if (allowedChannels.length > 0) {
                const orderChannel =
                    order.channelInformation?.channelDefinition?.channelName?.toLowerCase() ||
                    "";

                if (!allowedChannels.includes(orderChannel)) {
                    log.skipped = true;
                    log.skippedReason = `Channel '${orderChannel}' not in allowed list`;
                    console.error(JSON.stringify(log));
                    return { success: true, itemsProcessed: 0, skipped: true };
                }
            }

            // Check if order is cancelled
            if (order.cancelledAt) {
                log.skipped = true;
                log.skippedReason = "Order is cancelled";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            // Check if shipping label was cancelled/voided after purchase
            let labelCancelled = false;
            if (args.labelPurchaseTime && args.shippingLabelCost > 0) {
                labelCancelled = await isShippingLabelCancelled(
                    args.orderGid,
                    args.labelPurchaseTime,
                    args.shop,
                    args.accessToken
                );
                if (labelCancelled) {
                    log.skipped = true;
                    log.skippedReason = "Shipping label was cancelled/voided";
                    if (log.shippingData) {
                        log.shippingData.wasCancelled = true;
                    }
                    console.error(JSON.stringify(log));
                    return { success: true, itemsProcessed: 0, skipped: true };
                }
            }

            // Extract fulfillment date from fulfillments and check for cancelled fulfillments
            let fulfillmentTimestamp: number | undefined = undefined;
            let fulfillmentDate: string | undefined = undefined;
            let fulfillmentStatus: string | undefined = undefined;
            let hasActiveFulfillment = false;
            if (
                order.fulfillments &&
                Array.isArray(order.fulfillments) &&
                order.fulfillments.length > 0
            ) {
                // Filter out cancelled fulfillments
                const activeFulfillments = order.fulfillments.filter(
                    (f: any) =>
                        f.status && f.status.toUpperCase() !== "CANCELLED"
                );

                // If we have shipping label cost but all fulfillments are cancelled, skip this order
                if (
                    activeFulfillments.length === 0 &&
                    args.shippingLabelCost > 0
                ) {
                    log.skipped = true;
                    log.skippedReason = "All fulfillments are cancelled";
                    if (log.shippingData) {
                        log.shippingData.wasCancelled = true;
                    }
                    console.error(JSON.stringify(log));
                    return { success: true, itemsProcessed: 0, skipped: true };
                }

                hasActiveFulfillment = activeFulfillments.length > 0;

                // Get the latest active fulfillment's createdAt
                if (hasActiveFulfillment) {
                    const latestFulfillment = activeFulfillments.reduce(
                        (latest: any, current: any) => {
                            if (!latest || !latest.createdAt) return current;
                            if (!current.createdAt) return latest;
                            return new Date(current.createdAt) >
                                new Date(latest.createdAt)
                                ? current
                                : latest;
                        },
                        null
                    );

                    if (latestFulfillment?.createdAt) {
                        fulfillmentTimestamp = new Date(
                            latestFulfillment.createdAt
                        ).getTime();
                        fulfillmentDate = latestFulfillment.createdAt;
                        fulfillmentStatus = latestFulfillment.status;
                    }
                }
            }

            if (fulfillmentTimestamp) {
                log.fulfillmentData = {
                    fulfillmentTimestamp: fulfillmentTimestamp,
                    fulfillmentDate: fulfillmentDate,
                    fulfillmentStatus: fulfillmentStatus,
                };
            }

            // Check if order already exists (by orderId and orderDate)
            const orderExists = await ctx.runQuery(
                internal.products.checkOrderExists,
                {
                    userId: args.userId,
                    orderId: orderId,
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

            const lineItems = order.lineItems.edges.map((e: any) => e.node);
            if (log.orderData) {
                log.orderData.lineItemsCount = lineItems.length;
            }
            log.summary.totalItems = lineItems.length;

            // Extract buyer paid shipping from shippingLine
            const buyerPaidShippingTotal = parseFloat(
                order.shippingLine?.discountedPriceSet?.shopMoney?.amount || "0"
            );

            // Extract shipping insurance from order events
            // Query events to find insurance-related messages
            let shippingInsurance = 0;
            try {
                const orderEventsQuery = `
                    query OrderEvents($orderId: ID!, $first: Int!) {
                      order(id: $orderId) {
                        id
                        events(first: $first, sortKey: CREATED_AT, reverse: false) {
                          edges {
                            node {
                              id
                              createdAt
                              message
                              ... on BasicEvent {
                                action
                              }
                            }
                          }
                        }
                      }
                    }
                `;

                const eventsData = await fetchShopifyGraphQL(
                    orderEventsQuery,
                    { orderId: args.orderGid, first: 250 },
                    args.shop,
                    args.accessToken
                );

                if (eventsData.order && eventsData.order.events) {
                    const events = eventsData.order.events.edges || [];
                    for (const edge of events) {
                        const event = edge.node;
                        const message = (event.message || "").toLowerCase();

                        // Check for insurance events (excluding cancellations)
                        if (
                            (message.includes("insurance") ||
                                message.includes("shipsurance")) &&
                            !message.includes("void") &&
                            !message.includes("cancel") &&
                            !message.includes("cancelled")
                        ) {
                            const match = event.message?.match(
                                /\$([0-9]+(?:\.[0-9]{2})?)/
                            );
                            const insuranceCost = match
                                ? parseFloat(match[1])
                                : null;

                            if (insuranceCost != null) {
                                shippingInsurance += insuranceCost;
                            }
                        }
                    }
                }
            } catch (error) {
                // If we can't fetch events, insurance will remain 0
                // This is not a critical error - we'll just proceed without insurance data
                console.error(
                    `Error fetching insurance for order ${args.orderGid}:`,
                    error
                );
            }

            // Calculate total shipping including insurance
            const totalShippingWithInsurance =
                args.shippingLabelCost + shippingInsurance;

            // Calculate total quantity across all line items
            const totalQuantity = lineItems.reduce(
                (sum: number, item: any) => sum + item.quantity,
                0
            );
            log.summary.totalQuantity = totalQuantity;

            // Use total shipping including insurance for calculations
            const totalOrderShipping = totalShippingWithInsurance;

            // Split shipping cost evenly across all units
            const shippingPerUnit =
                totalQuantity > 0 ? totalOrderShipping / totalQuantity : 0;

            // Split buyer paid shipping evenly across all units (using same shippingPercentage)
            const buyerPaidShippingPerUnit =
                totalQuantity > 0 ? buyerPaidShippingTotal / totalQuantity : 0;

            log.shippingData = {
                rawShippingLabelCost: args.shippingLabelCost,
                shippingInsurance: shippingInsurance,
                totalShippingWithInsurance: totalShippingWithInsurance,
                buyerPaidShipping: buyerPaidShippingTotal,
                shippingPerUnit: shippingPerUnit,
                buyerPaidShippingPerUnit: buyerPaidShippingPerUnit,
                wasCancelled: labelCancelled,
            };

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

            for (const item of lineItems) {
                const pricePerUnit = parseFloat(
                    item.originalUnitPriceSet?.shopMoney?.amount || "0"
                );
                if (pricePerUnit === 0) {
                    continue;
                }
                const quantity = item.quantity;
                const sku = item.sku || item.id;
                const name = item.title || "Unknown Product";
                const lineItemId = item.id;

                // Calculate Shopify fees (2.9% + $0.30 per transaction, split across items)
                const transactionFeePercentage = pricePerUnit * 0.029;
                const transactionFeeFixed = 0.3;
                const totalTransactionFee =
                    transactionFeePercentage + transactionFeeFixed;
                const transactionFeePerUnit = totalTransactionFee / quantity;

                // Create fee breakdown per unit
                const feesBreakdownPerUnit: Array<[string, number]> = [
                    [
                        "Transaction Fee (2.9%)",
                        transactionFeePercentage / quantity,
                    ],
                    [
                        "Transaction Fee (Fixed $0.30)",
                        transactionFeeFixed / quantity,
                    ],
                ];

                // Store item data in log before processing
                logItems.push({
                    lineItemId: lineItemId,
                    sku: sku,
                    title: name,
                    quantity: quantity,
                    price: pricePerUnit * quantity,
                    pricePerUnit: pricePerUnit,
                    fees: totalTransactionFee,
                    feesPerUnit: transactionFeePerUnit,
                    feesBreakdown: feesBreakdownPerUnit,
                    shippingPerUnit: shippingPerUnit,
                    buyerPaidShippingPerUnit: buyerPaidShippingPerUnit,
                });

                // Create shipping breakdown (base shipping + insurance)
                const shippingBreakdown: Array<[string, number]> = [];
                const baseShippingPerUnit =
                    args.shippingLabelCost / totalQuantity;
                const insurancePerUnit = shippingInsurance / totalQuantity;

                if (baseShippingPerUnit > 0 || insurancePerUnit > 0) {
                    if (baseShippingPerUnit > 0) {
                        shippingBreakdown.push([
                            "Base Shipping",
                            baseShippingPerUnit,
                        ]);
                    }
                    if (insurancePerUnit > 0) {
                        shippingBreakdown.push([
                            "Shipping Insurance",
                            insurancePerUnit,
                        ]);
                    }
                }

                // Calculate shipping percentage (what % of total order shipping this unit represents)
                const shippingPercentage =
                    totalOrderShipping > 0
                        ? (shippingPerUnit / totalOrderShipping) * 100
                        : 0;

                // Create a marketplace product for each unit
                for (let i = 0; i < quantity; i++) {
                    await ctx.runMutation(
                        internal.products.upsertMarketplaceProduct,
                        {
                            userId: args.userId,
                            marketplace: "Shopify",
                            sku,
                            name,
                            price: pricePerUnit,
                            fees: transactionFeePerUnit,
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
                            orderId: orderId,
                            OrderId: orderId || "",
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

export const syncShopifyOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            // Get Shopify connection from database
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

            const { shop, accessToken } = connection;

            const endDate = new Date();
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 1);

            const batches = generateMonthlyBatches(startDate, endDate);

            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("shopify"),
                undefined
            );

            // Query to get order events
            const eventsQuery = `
        query OrderEvents($first: Int!, $after: String, $query: String!) {
          events(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                createdAt
                message
                ... on BasicEvent {
                  action
                  subjectType
                  subject {
                    ... on Order {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `;

            const allLabelEvents: Array<{
                orderGid: string;
                cost: number;
                message: string;
                createdAt: string;
            }> = [];

            // Fetch events for each batch
            for (
                let batchIndex = 0;
                batchIndex < batches.length;
                batchIndex++
            ) {
                // Validate sync exists and is active before processing each batch
                await validateSyncActive(ctx, args.syncId);

                const batch = batches[batchIndex];
                const batchStartDate = batch.start.toISOString().split("T")[0];
                const batchEndDate = batch.end.toISOString().split("T")[0];

                await updateSyncProgress(
                    ctx,
                    args.syncId,
                    SyncMessages.fetchingBatch(
                        "shopify",
                        batchIndex + 1,
                        batches.length
                    ),
                    undefined
                );

                const queryString = `subject_type:Order created_at:>=${batchStartDate} created_at:<=${batchEndDate}`;
                let cursor: string | null = null;
                let hasNextPage = true;
                let page = 0;
                const maxPages = 20; // Safety limit

                // Fetch all label events for this batch
                while (hasNextPage && page < maxPages) {
                    const data = await fetchShopifyGraphQL(
                        eventsQuery,
                        {
                            first: 100,
                            after: cursor,
                            query: queryString,
                        },
                        shop,
                        accessToken
                    );

                    const events = data.events;
                    cursor = events.pageInfo.endCursor;
                    hasNextPage = events.pageInfo.hasNextPage;
                    page++;

                    for (const edge of events.edges) {
                        const event = edge.node;
                        const message = event.message || "";
                        const messageLower = message.toLowerCase();

                        // Look for shipping label purchase events
                        // Skip if this is a cancellation/void event
                        if (
                            messageLower.includes("shipping label") &&
                            !messageLower.includes("void") &&
                            !messageLower.includes("cancel") &&
                            !messageLower.includes("cancelled")
                        ) {
                            const match = message.match(
                                /\$([0-9]+(?:\.[0-9]{2})?)/
                            );
                            const cost = match ? parseFloat(match[1]) : null;

                            if (cost != null && event.subject?.id) {
                                allLabelEvents.push({
                                    orderGid: event.subject.id,
                                    cost,
                                    message,
                                    createdAt: event.createdAt,
                                });
                            }
                        }
                    }
                }

                // Small delay between batches to avoid rate limiting
                if (batchIndex < batches.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }

            // Group shipping label events by order ID and sum costs
            // This handles cases where multiple products ship separately with separate labels
            const ordersByGid: Record<
                string,
                { totalCost: number; earliestCreatedAt: string }
            > = {};

            for (const labelEvent of allLabelEvents) {
                if (!ordersByGid[labelEvent.orderGid]) {
                    ordersByGid[labelEvent.orderGid] = {
                        totalCost: 0,
                        earliestCreatedAt: labelEvent.createdAt,
                    };
                }
                ordersByGid[labelEvent.orderGid].totalCost += labelEvent.cost;
                // Use earliest createdAt for cancellation checking
                if (
                    new Date(labelEvent.createdAt) <
                    new Date(ordersByGid[labelEvent.orderGid].earliestCreatedAt)
                ) {
                    ordersByGid[labelEvent.orderGid].earliestCreatedAt =
                        labelEvent.createdAt;
                }
            }

            // Convert to array for processing
            const uniqueOrders = Object.entries(ordersByGid).map(
                ([orderGid, data]) => ({
                    orderGid,
                    shippingLabelCost: data.totalCost,
                    labelPurchaseTime: data.earliestCreatedAt,
                })
            );

            await processWithProgress(
                ctx,
                args.syncId,
                uniqueOrders,
                async (orderData, _i) => {
                    await ctx.runAction(internal.shopify.processShopifyOrder, {
                        userId: args.userId,
                        orderGid: orderData.orderGid,
                        shippingLabelCost: orderData.shippingLabelCost,
                        shop,
                        accessToken,
                        updateExisting: args.updateExisting ?? false,
                        labelPurchaseTime: orderData.labelPurchaseTime,
                    });
                },
                "shopify"
            );

            // Validate sync exists and is active before finishing
            await validateSyncActive(ctx, args.syncId);

            await finishSync(ctx, args.syncId, "shopify");

            return { success: true, ordersProcessed: uniqueOrders.length };
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
                await handleSyncError(ctx, args.syncId, error, "shopify");
            }
            throw error;
        }
    },
});

export const syncShopifyOrders = internalAction({
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

            // Get Shopify connection from database
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

            const { shop, accessToken } = connection;

            // Default to last 30 days if no start date provided
            const startDate =
                args.startDate ||
                new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0];

            await updateSyncProgress(
                ctx,
                args.syncId,
                SyncMessages.fetching("shopify"),
                undefined
            );

            // Query to get order events
            const eventsQuery = `
        query OrderEvents($first: Int!, $after: String, $query: String!) {
          events(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                createdAt
                message
                ... on BasicEvent {
                  action
                  subjectType
                  subject {
                    ... on Order {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `;

            const queryString = `subject_type:Order created_at:>=${startDate}`;
            let cursor: string | null = null;
            let hasNextPage = true;
            let page = 0;
            const maxPages = 20; // Safety limit

            const labelEvents: Array<{
                orderGid: string;
                cost: number;
                message: string;
                createdAt: string;
            }> = [];

            // Fetch all label events
            while (hasNextPage && page < maxPages) {
                const data = await fetchShopifyGraphQL(
                    eventsQuery,
                    {
                        first: 100,
                        after: cursor,
                        query: queryString,
                    },
                    shop,
                    accessToken
                );

                const events = data.events;
                cursor = events.pageInfo.endCursor;
                hasNextPage = events.pageInfo.hasNextPage;
                page++;

                for (const edge of events.edges) {
                    const event = edge.node;
                    const message = event.message || "";
                    const messageLower = message.toLowerCase();

                    // Look for shipping label purchase events
                    // Skip if this is a cancellation/void event
                    if (
                        messageLower.includes("shipping label") &&
                        !messageLower.includes("void") &&
                        !messageLower.includes("cancel") &&
                        !messageLower.includes("cancelled")
                    ) {
                        const match = message.match(
                            /\$([0-9]+(?:\.[0-9]{2})?)/
                        );
                        const cost = match ? parseFloat(match[1]) : null;

                        if (cost != null && event.subject?.id) {
                            labelEvents.push({
                                orderGid: event.subject.id,
                                cost,
                                message,
                                createdAt: event.createdAt,
                            });
                        }
                    }
                }
            }

            // Group shipping label events by order ID and sum costs
            // This handles cases where multiple products ship separately with separate labels
            const ordersByGid: Record<
                string,
                { totalCost: number; earliestCreatedAt: string }
            > = {};

            for (const labelEvent of labelEvents) {
                if (!ordersByGid[labelEvent.orderGid]) {
                    ordersByGid[labelEvent.orderGid] = {
                        totalCost: 0,
                        earliestCreatedAt: labelEvent.createdAt,
                    };
                }
                ordersByGid[labelEvent.orderGid].totalCost += labelEvent.cost;
                // Use earliest createdAt for cancellation checking
                if (
                    new Date(labelEvent.createdAt) <
                    new Date(ordersByGid[labelEvent.orderGid].earliestCreatedAt)
                ) {
                    ordersByGid[labelEvent.orderGid].earliestCreatedAt =
                        labelEvent.createdAt;
                }
            }

            // Convert to array for processing
            const uniqueOrders = Object.entries(ordersByGid).map(
                ([orderGid, data]) => ({
                    orderGid,
                    shippingLabelCost: data.totalCost,
                    labelPurchaseTime: data.earliestCreatedAt,
                })
            );

            await processWithProgress(
                ctx,
                args.syncId,
                uniqueOrders,
                async (orderData, _i) => {
                    await ctx.runAction(internal.shopify.processShopifyOrder, {
                        userId: args.userId,
                        orderGid: orderData.orderGid,
                        shippingLabelCost: orderData.shippingLabelCost,
                        shop,
                        accessToken,
                        updateExisting: args.updateExisting ?? false,
                        labelPurchaseTime: orderData.labelPurchaseTime,
                    });
                },
                "shopify"
            );

            await finishSync(ctx, args.syncId, "shopify");

            return { success: true, ordersProcessed: uniqueOrders.length };
        } catch (error: any) {
            await handleSyncError(ctx, args.syncId, error, "shopify");
            throw error;
        }
    },
});
