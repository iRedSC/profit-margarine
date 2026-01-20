"use node";

import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

/**
 * Common types for order processing across all marketplaces
 */

export interface ProcessedLineItem {
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
}

export interface ShippingData {
    rawShippingCost: number;
    shippingInsurance: number;
    totalShippingWithInsurance: number;
    buyerPaidShipping: number;
    shippingPerUnit: number;
    buyerPaidShippingPerUnit: number;
}

export interface FeesData {
    totalFees: number;
    orderLevelFees?: number;
    feesByLineItem?: Record<string, number>;
}

export interface OrderProcessingResult {
    success: boolean;
    itemsProcessed: number;
    skipped?: boolean;
    skippedReason?: string;
}

export interface OrderProcessingContext {
    userId: Id<"users">;
    orderId: string;
    updateExisting: boolean;
}

/**
 * Base order processing log structure
 */
export interface BaseOrderLog {
    operation: string;
    orderId: string;
    userId: string;
    updateExisting: boolean;
    timestamp: string;
    orderData?: {
        orderTimestamp?: number;
        orderExists?: boolean;
        lineItemsCount?: number;
        [key: string]: any;
    };
    shippingData?: ShippingData;
    fulfillmentData?: {
        fulfillmentTimestamp?: number;
        fulfillmentDate?: string;
        [key: string]: any;
    };
    feesData?: FeesData;
    items?: ProcessedLineItem[];
    summary: {
        totalItems: number;
        totalQuantity: number;
        itemsProcessed: number;
        itemsCreated: number;
    };
    errors: Array<{ step: string; error: string; timestamp: string }>;
    skipped: boolean;
    skippedReason?: string;
}

/**
 * Context for order processing
 */
export interface OrderProcessingContext {
    ctx: any;
    userId: Id<"users">;
    marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
    orderId: string;
    orderTimestamp: number;
    fulfillmentTimestamp: number | undefined;
    updateExisting: boolean;
}

/**
 * Helper function to create marketplace products from processed line items
 */
export async function createMarketplaceProducts(
    context: OrderProcessingContext,
    items: ProcessedLineItem[],
    shippingData: ShippingData,
    totalQuantity: number,
    log: BaseOrderLog
) {
    // Calculate per-unit shipping breakdown values (same for all items in the order)
    const baseShippingPerUnit = shippingData.rawShippingCost / totalQuantity;
    const insurancePerUnit = shippingData.shippingInsurance / totalQuantity;
    
    // Create base shipping breakdown template (will be reused for all items)
    const baseShippingBreakdown: Array<[string, number]> = [];
    if (baseShippingPerUnit > 0 || insurancePerUnit > 0) {
        if (baseShippingPerUnit > 0) {
            baseShippingBreakdown.push(["Base Shipping", baseShippingPerUnit]);
        }
        if (insurancePerUnit > 0) {
            baseShippingBreakdown.push(["Shipping Insurance", insurancePerUnit]);
        }
    }

    for (const item of items) {
        // Calculate shipping percentage (what % of total order shipping this unit represents)
        const shippingPercentage =
            shippingData.totalShippingWithInsurance > 0
                ? (item.shippingPerUnit / shippingData.totalShippingWithInsurance) * 100
                : 0;

        // Create a marketplace product for each unit
        for (let i = 0; i < item.quantity; i++) {
            await context.ctx.runMutation(internal.products.upsertMarketplaceProduct, {
                userId: context.userId,
                marketplace: context.marketplace,
                sku: item.sku,
                name: item.title,
                price: item.pricePerUnit,
                fees: item.feesPerUnit,
                fees_breakdown: item.feesBreakdown,
                shipping: item.shippingPerUnit,
                shipping_breakdown:
                    baseShippingBreakdown.length > 0 ? baseShippingBreakdown : undefined,
                shippingPercentage,
                buyerPaidShipping: item.buyerPaidShippingPerUnit,
                orderTimestamp: context.orderTimestamp,
                fulfillmentTimestamp: context.fulfillmentTimestamp,
                orderId: context.orderId,
                OrderId: context.orderId,
                updateExisting: context.updateExisting,
            });
            log.summary.itemsCreated++;
        }
        log.summary.itemsProcessed++;
    }
}

/**
 * Helper function to calculate shipping per unit
 */
export function calculateShippingPerUnit(
    totalShipping: number,
    totalQuantity: number
): number {
    return totalQuantity > 0 ? totalShipping / totalQuantity : 0;
}

/**
 * Helper function to calculate buyer paid shipping per unit
 */
export function calculateBuyerPaidShippingPerUnit(
    buyerPaidShippingTotal: number,
    totalQuantity: number
): number {
    return totalQuantity > 0 ? buyerPaidShippingTotal / totalQuantity : 0;
}

/**
 * Helper function to check if order should be skipped
 */
export interface OrderSkipCheck {
    shouldSkip: boolean;
    reason?: string;
}

export function checkOrderSkip(
    orderExists: boolean,
    updateExisting: boolean,
    isCancelled: boolean,
    customChecks?: () => OrderSkipCheck
): OrderSkipCheck {
    if (orderExists && !updateExisting) {
        return { shouldSkip: true, reason: "Order already exists" };
    }
    if (isCancelled) {
        return { shouldSkip: true, reason: "Order is cancelled" };
    }
    if (customChecks) {
        return customChecks();
    }
    return { shouldSkip: false };
}
