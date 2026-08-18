"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { getErrorMessage } from "../marketplaceUtils";
import { isRecord } from "./token";
import {
    getOrderStatementTransactions,
    getTiktokOrderDetails,
} from "./client";
import {
    allocateFinanceToUnits,
    parseOrderFinance,
    parseSignedAmount,
} from "./finance";

const SKIP_ORDER_STATUSES = new Set([
    "UNPAID",
    "ON_HOLD",
    "CANCELLED",
]);

function asString(value: unknown, fallback = ""): string {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number") {
        return String(value);
    }
    return fallback;
}

function unixMs(value: unknown): number | undefined {
    const seconds = parseSignedAmount(value);
    if (seconds <= 0) {
        return undefined;
    }
    return seconds > 1e12 ? seconds : seconds * 1000;
}

function isCancelledLine(item: Record<string, unknown>): boolean {
    const status = asString(item.display_status).toUpperCase();
    return (
        status.includes("CANCEL") ||
        asString(item.cancel_reason).length > 0
    );
}

export const processTiktokOrder = internalAction({
    args: {
        userId: v.id("users"),
        orderId: v.string(),
        accessToken: v.string(),
        shopCipher: v.string(),
        unsettledFinanceJson: v.optional(v.string()),
        updateExisting: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const log: {
            operation: string;
            orderId: string;
            skipped: boolean;
            skippedReason?: string;
            itemsProcessed: number;
            itemsCreated: number;
            usedEstimatedFees: boolean;
        } = {
            operation: "process_tiktok_order",
            orderId: args.orderId,
            skipped: false,
            itemsProcessed: 0,
            itemsCreated: 0,
            usedEstimatedFees: false,
        };

        try {
            const orders = await getTiktokOrderDetails({
                accessToken: args.accessToken,
                shopCipher: args.shopCipher,
                orderIds: [args.orderId],
            });
            const orderRaw = orders[0];
            if (!isRecord(orderRaw)) {
                log.skipped = true;
                log.skippedReason = "Order detail not found";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            const status = asString(
                orderRaw.status ?? orderRaw.order_status
            ).toUpperCase();
            if (SKIP_ORDER_STATUSES.has(status)) {
                log.skipped = true;
                log.skippedReason = `Order status ${status}`;
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            const orderTimestamp =
                unixMs(orderRaw.create_time) ?? Date.now();
            const fulfillmentTimestamp =
                unixMs(orderRaw.delivery_time) ?? unixMs(orderRaw.rts_time);

            const payment = isRecord(orderRaw.payment_info)
                ? orderRaw.payment_info
                : {};
            const buyerPaidShippingTotal = parseSignedAmount(
                payment.shipping_fee
            );

            const rawLineItems = Array.isArray(orderRaw.line_items)
                ? orderRaw.line_items
                : Array.isArray(orderRaw.item_list)
                  ? orderRaw.item_list
                  : [];
            const lineItems: Array<{
                skuId: string;
                sku: string;
                name: string;
                quantity: number;
                price: number;
            }> = [];

            for (const rawItem of rawLineItems) {
                if (!isRecord(rawItem) || isCancelledLine(rawItem)) {
                    continue;
                }
                const price =
                    parseSignedAmount(rawItem.sale_price) ||
                    parseSignedAmount(rawItem.original_price) ||
                    parseSignedAmount(rawItem.sku_original_price);
                if (price <= 0) {
                    continue;
                }
                const skuId = asString(rawItem.sku_id);
                const sku =
                    asString(rawItem.seller_sku) || skuId || asString(rawItem.id);
                const productName = asString(rawItem.product_name, "TikTok item");
                const skuName = asString(rawItem.sku_name);
                const name =
                    skuName && skuName !== productName
                        ? `${productName} (${skuName})`
                        : productName;
                const quantity = Math.max(
                    1,
                    Math.trunc(parseSignedAmount(rawItem.quantity) || 1)
                );
                lineItems.push({ skuId, sku, name, quantity, price });
            }

            if (lineItems.length === 0) {
                log.skipped = true;
                log.skippedReason = "No billable line items";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            const orderExists = await ctx.runQuery(
                internal.products.checkOrderExists,
                {
                    userId: args.userId,
                    orderId: args.orderId,
                    orderDate: orderTimestamp,
                }
            );

            if (orderExists && !args.updateExisting) {
                log.skipped = true;
                log.skippedReason = "Order already exists";
                console.error(JSON.stringify(log));
                return { success: true, itemsProcessed: 0, skipped: true };
            }

            let financeRows: ReturnType<typeof parseOrderFinance> = [];
            try {
                const financePayload = await getOrderStatementTransactions({
                    accessToken: args.accessToken,
                    shopCipher: args.shopCipher,
                    orderId: args.orderId,
                });
                financeRows = parseOrderFinance(financePayload);
            } catch (error: unknown) {
                console.error(
                    JSON.stringify({
                        operation: "tiktok_finance_fetch_failed",
                        orderId: args.orderId,
                        error: getErrorMessage(error),
                    })
                );
                financeRows = [];
            }

            if (
                financeRows.length === 0 &&
                args.unsettledFinanceJson
            ) {
                const unsettledPayload: unknown = JSON.parse(
                    args.unsettledFinanceJson
                );
                financeRows = parseOrderFinance(unsettledPayload);
            }

            if (financeRows.length === 0) {
                log.usedEstimatedFees = true;
            }

            const shares = allocateFinanceToUnits(lineItems, financeRows);
            const totalQuantity = lineItems.reduce(
                (sum, item) => sum + item.quantity,
                0
            );
            const totalOrderShipping = shares.reduce(
                (sum, share, index) =>
                    sum + share.shipping * lineItems[index].quantity,
                0
            );

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

            for (let i = 0; i < lineItems.length; i++) {
                const item = lineItems[i];
                const share = shares[i];
                const buyerPaidFromFinance = share.buyerPaidShipping;
                const buyerPaidShipping =
                    buyerPaidFromFinance > 0
                        ? buyerPaidFromFinance
                        : buyerPaidShippingTotal / Math.max(1, totalQuantity);
                const shippingPercentage =
                    totalOrderShipping > 0
                        ? (share.shipping / totalOrderShipping) * 100
                        : 0;

                for (let unit = 0; unit < item.quantity; unit++) {
                    await ctx.runMutation(
                        internal.products.upsertMarketplaceProduct,
                        {
                            userId: args.userId,
                            marketplace: "TikTok",
                            sku: item.sku,
                            name: item.name,
                            price: item.price,
                            fees: share.fees,
                            fees_breakdown: share.feesBreakdown,
                            shipping: share.shipping,
                            shipping_breakdown:
                                share.shippingBreakdown.length > 0
                                    ? share.shippingBreakdown
                                    : undefined,
                            shippingPercentage,
                            buyerPaidShipping,
                            orderTimestamp,
                            fulfillmentTimestamp,
                            orderId: args.orderId,
                            updateExisting: false,
                        }
                    );
                    log.itemsCreated++;
                }
                log.itemsProcessed++;
            }

            console.error(JSON.stringify(log));
            return { success: true, itemsProcessed: log.itemsProcessed };
        } catch (error: unknown) {
            console.error(
                JSON.stringify({
                    ...log,
                    error: getErrorMessage(error),
                })
            );
            throw error;
        }
    },
});
