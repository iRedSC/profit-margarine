"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { fetchShopifyGraphQL } from "./graphql";

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
            // Insurance information is in the same message as the shipping label purchase
            for (const edge of events) {
                const event = edge.node;
                const message = (event.message || "").toLowerCase();
                const originalMessage = event.message || "";

                // Look for shipping label purchase events
                // Skip if this is a cancellation/void event
                if (
                    message.includes("shipping label") &&
                    !message.includes("void") &&
                    !message.includes("cancel") &&
                    !message.includes("cancelled")
                ) {
                    // Extract shipping label cost
                    // Pattern 1: "You purchased a $X.XX shipping label..."
                    // Pattern 2: "You purchased a shipping label for $X.XX..."
                    let shippingCost: number | null = null;
                    
                    // Try pattern 1: "purchased a $X.XX shipping label"
                    const pattern1Match = originalMessage.match(
                        /purchased a \$([0-9]+(?:\.[0-9]{2})?)\s+shipping label/i
                    );
                    if (pattern1Match) {
                        shippingCost = parseFloat(pattern1Match[1]);
                    } else {
                        // Try pattern 2: "shipping label for $X.XX"
                        const pattern2Match = originalMessage.match(
                            /shipping label for \$([0-9]+(?:\.[0-9]{2})?)/i
                        );
                        if (pattern2Match) {
                            shippingCost = parseFloat(pattern2Match[1]);
                        } else {
                            // Fallback: get first dollar amount
                            const match = originalMessage.match(
                                /\$([0-9]+(?:\.[0-9]{2})?)/
                            );
                            shippingCost = match ? parseFloat(match[1]) : null;
                        }
                    }

                    if (shippingCost != null && !isNaN(shippingCost)) {
                        totalShippingCost += shippingCost;
                    }

                    // Extract insurance from the same message if mentioned
                    if (
                        message.includes("insurance") ||
                        message.includes("shipsurance")
                    ) {
                        // Check if insurance is included (no separate cost)
                        // Pattern: "You purchased a $X.XX shipping label and the included shipping insurance premium."
                        if (message.includes("included shipping insurance")) {
                            // Insurance is included in the shipping cost, so insurance = 0
                            totalInsurance += 0;
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
                                    totalInsurance += insuranceCost;
                                }
                            }
                        }
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
export async function isShippingLabelCancelled(
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
