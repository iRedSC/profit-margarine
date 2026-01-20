"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
    generateMonthlyBatches,
    updateSyncProgress,
    handleSyncError,
    processWithProgress,
    validateSyncActive,
    finishSync,
} from "../marketplaceUtils";
import { SyncMessages } from "../syncMessages";
import { fetchShopifyGraphQL } from "./graphql";

type SyncResult =
    | { success: boolean; ordersProcessed: number }
    | { success: false; canceled: true };

/**
 * Sync Shopify orders within a date range
 * If date range spans more than 30 days, uses monthly batching
 */
export const syncShopifyOrders = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(ctx, args.syncId);

            // Get Shopify connection from database
            const connection = await ctx.runQuery(
                internal.shopifyMutations.getShopifyConnection as any,
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

            // Determine date range
            const endDateObj = args.endDate
                ? new Date(args.endDate)
                : new Date();
            const startDateObj = args.startDate
                ? new Date(args.startDate)
                : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days

            // Use monthly batching if date range is more than 30 days
            const daysDiff =
                (endDateObj.getTime() - startDateObj.getTime()) /
                (1000 * 60 * 60 * 24);
            const useBatching = daysDiff > 30;

            const batches = useBatching
                ? generateMonthlyBatches(startDateObj, endDateObj)
                : [{ start: startDateObj, end: endDateObj }];

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

                if (useBatching) {
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
                }

                const queryString = useBatching
                    ? `subject_type:Order created_at:>=${batchStartDate} created_at:<=${batchEndDate}`
                    : `subject_type:Order created_at:>=${batchStartDate}`;
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
                    await ctx.runAction(
                        internal.shopify.processShopifyOrder as any,
                        {
                            userId: args.userId,
                            orderGid: orderData.orderGid,
                            shippingLabelCost: orderData.shippingLabelCost,
                            shop,
                            accessToken,
                            updateExisting: args.updateExisting ?? false,
                            labelPurchaseTime: orderData.labelPurchaseTime,
                        }
                    );
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

/**
 * Sync Shopify orders for the past year
 */
export const syncShopifyOrdersOneYear = internalAction({
    args: {
        userId: v.id("users"),
        syncId: v.id("syncs"),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args): Promise<SyncResult> => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);

        const result = await ctx.runAction(internal.shopify.syncShopifyOrders, {
            userId: args.userId,
            syncId: args.syncId,
            startDate: startDate.toISOString().split("T")[0],
            endDate: endDate.toISOString().split("T")[0],
            updateExisting: args.updateExisting ?? false,
        });
        return result as SyncResult;
    },
});
