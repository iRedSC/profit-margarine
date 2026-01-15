"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateMonthlyBatches, updateSyncProgress, handleSyncError, processWithProgress, isSyncCanceled, validateSyncActive } from "./marketplaceUtils";
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

export const processShopifyOrder = internalAction({
    args: {
        userId: v.id("users"),
        orderGid: v.string(),
        shippingLabelCost: v.number(),
        shop: v.string(),
        accessToken: v.string(),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const log: {
            orderGid: string;
            steps: string[];
            errors: Array<{ step: string; error: string }>;
            skipped: boolean;
            itemsProcessed: number;
        } = {
            orderGid: args.orderGid,
            steps: [],
            errors: [],
            skipped: false,
            itemsProcessed: 0,
        };

        try {
            // Extract numeric ID from GID (gid://shopify/Order/123456)
            const orderId = args.orderGid.split("/").pop() || "";
            log.steps.push(`Extracted order ID: ${orderId}`);

            const query = `
        query GetOrder($id: ID!) {
          order(id: $id) {
            id
            name
            createdAt
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
            log.steps.push("Fetched order from Shopify GraphQL API");

            if (!order) {
                throw new Error(`Order not found: ${args.orderGid}`);
            }

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
                    log.steps.push(`Order skipped - channel '${orderChannel}' not in allowed list`);
                    console.error(JSON.stringify(log));
                    return { success: true, itemsProcessed: 0, skipped: true };
                }
            }

            const orderTimestamp = new Date(order.createdAt).getTime();

            // Check if order already exists (by orderId and orderDate)
            const orderExists = await ctx.runQuery(
                internal.products.checkOrderExists,
                {
                    userId: args.userId,
                    orderId: orderId,
                    orderDate: orderTimestamp,
                }
            );

            if (orderExists && !args.updateExisting) {
                log.skipped = true;
                log.steps.push("Order already exists, skipped");
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            log.steps.push("Calculated shipping and fees");

            const lineItems = order.lineItems.edges.map((e: any) => e.node);

            // Extract buyer paid shipping from shippingLine
            const buyerPaidShippingTotal = parseFloat(
                order.shippingLine?.discountedPriceSet?.shopMoney?.amount || "0"
            );

            // Calculate total quantity across all line items
            const totalQuantity = lineItems.reduce(
                (sum: number, item: any) => sum + item.quantity,
                0
            );

            // Split shipping cost evenly across all units
            const shippingPerUnit =
                totalQuantity > 0 ? args.shippingLabelCost / totalQuantity : 0;

            // Split buyer paid shipping evenly across all units (using same shippingPercentage)
            const buyerPaidShippingPerUnit =
                totalQuantity > 0 ? buyerPaidShippingTotal / totalQuantity : 0;

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

                // Calculate Shopify fees (2.9% + $0.30 per transaction, split across items)
                const transactionFeePerUnit =
                    (pricePerUnit * 0.029 + 0.3) / quantity;

                // Calculate shipping percentage (what % of total order shipping this unit represents)
                const shippingPercentage =
                    args.shippingLabelCost > 0
                        ? (shippingPerUnit / args.shippingLabelCost) * 100
                        : 0;

                // Create a marketplace product for each unit
                for (let i = 0; i < quantity; i++) {
                    await ctx.runMutation(
                        internal.shopifyMutations.upsertProductFromShopify,
                        {
                            userId: args.userId,
                            sku,
                            name,
                            price: pricePerUnit,
                            fees: transactionFeePerUnit,
                            shipping: shippingPerUnit,
                            shippingPercentage,
                            buyerPaidShipping: buyerPaidShippingPerUnit,
                            orderTimestamp,
                            orderId: orderId,
                            OrderId: orderId || "",
                            updateExisting: args.updateExisting ?? false,
                        }
                    );
                    log.itemsProcessed++;
                }
            }

            log.steps.push(`Created ${log.itemsProcessed} product records`);
            console.error(JSON.stringify(log));
            return { success: true, itemsProcessed: lineItems.length };
        } catch (error: any) {
            log.errors.push({
                step: "process_order",
                error: error.message || String(error),
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
                    SyncMessages.fetchingBatch("shopify", batchIndex + 1, batches.length),
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

                        // Look for shipping label purchase events
                        if (message.toLowerCase().includes("shipping label")) {
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

            await processWithProgress(
                ctx,
                args.syncId,
                allLabelEvents,
                async (labelEvent, i) => {

                    await ctx.runAction(internal.shopify.processShopifyOrder, {
                        userId: args.userId,
                        orderGid: labelEvent.orderGid,
                        shippingLabelCost: labelEvent.cost,
                        shop,
                        accessToken,
                        updateExisting: args.updateExisting ?? false,
                    });
                },
                "shopify"
            );

            // Validate sync exists and is active before finishing
            await validateSyncActive(ctx, args.syncId);

            await finishSync(ctx, args.syncId, "shopify");

            return { success: true, ordersProcessed: allLabelEvents.length };
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

                    // Look for shipping label purchase events
                    if (message.toLowerCase().includes("shipping label")) {
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

            await processWithProgress(
                ctx,
                args.syncId,
                labelEvents,
                async (labelEvent, i) => {

                    await ctx.runAction(internal.shopify.processShopifyOrder, {
                        userId: args.userId,
                        orderGid: labelEvent.orderGid,
                        shippingLabelCost: labelEvent.cost,
                        shop,
                        accessToken,
                        updateExisting: args.updateExisting ?? false,
                    });
                },
                "shopify"
            );

            await finishSync(ctx, args.syncId, "shopify");

            return { success: true, ordersProcessed: labelEvents.length };
        } catch (error: any) {
            await handleSyncError(ctx, args.syncId, error, "shopify");
            throw error;
        }
    },
});
