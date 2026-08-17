"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getErrorMessage } from "../marketplaceUtils";
import {
    fetchShopifyGraphQL,
    type ShopifyFulfillment,
} from "./graphql";
import { isShippingLabelCancelled } from "./shipping";
import { splitOrderCosts } from "../lib/orderCosts";

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
                    (f) => f.status && f.status.toUpperCase() !== "CANCELLED"
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
                        (latest: ShopifyFulfillment | null, current) => {
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
            const checkOrderExistsQuery = internal.products.checkOrderExists;
            const orderExists = await ctx.runQuery(checkOrderExistsQuery, {
                userId: args.userId,
                orderId: orderId,
                orderDate: orderTimestamp,
            });

            if (log.orderData) {
                log.orderData.orderExists = orderExists;
            }

            if (orderExists && !args.updateExisting) {
                log.skipped = true;
                log.skippedReason = "Order already exists";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            const lineItems = order.lineItems.edges.map((e) => e.node);
            if (log.orderData) {
                log.orderData.lineItemsCount = lineItems.length;
            }
            log.summary.totalItems = lineItems.length;

            // Extract buyer paid shipping from shippingLine
            const buyerPaidShippingTotal = parseFloat(
                order.shippingLine?.discountedPriceSet?.shopMoney?.amount || "0"
            );

            // Extract shipping insurance from shipping label purchase events
            // Insurance information is in the same message as the shipping label purchase
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
                        const originalMessage = event.message || "";

                        // Look for shipping label purchase events that mention insurance
                        if (
                            message.includes("shipping label") &&
                            (message.includes("insurance") ||
                                message.includes("shipsurance")) &&
                            !message.includes("void") &&
                            !message.includes("cancel") &&
                            !message.includes("cancelled")
                        ) {
                            // Check if insurance is included (no separate cost)
                            // Pattern: "You purchased a $X.XX shipping label and the included shipping insurance premium."
                            if (message.includes("included shipping insurance")) {
                                // Insurance is included in the shipping cost, so insurance = 0
                                shippingInsurance += 0;
                            } else {
                                // Check for separate insurance premium
                                // Pattern: "You purchased a shipping label for $X.XX with a $Y.YY shipping insurance premium."
                                const insuranceMatch = originalMessage.match(
                                    /with a \$([0-9]+(?:\.[0-9]{2})?)\s+shipping insurance premium/i
                                );
                                if (insuranceMatch) {
                                    const insuranceCost = parseFloat(
                                        insuranceMatch[1]
                                    );
                                    if (!isNaN(insuranceCost)) {
                                        shippingInsurance += insuranceCost;
                                    }
                                }
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
                (sum, item) => sum + item.quantity,
                0
            );
            log.summary.totalQuantity = totalQuantity;

            // Use total shipping including insurance for calculations
            const totalOrderShipping = totalShippingWithInsurance;

            // Split shipping cost evenly across all units
            const { shippingPerUnit, buyerPaidPerUnit: buyerPaidShippingPerUnit } =
                totalQuantity > 0
                    ? splitOrderCosts({
                          totalShipping: totalOrderShipping,
                          totalBuyerPaid: buyerPaidShippingTotal,
                          totalQty: totalQuantity,
                      })
                    : { shippingPerUnit: 0, buyerPaidPerUnit: 0 };

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
