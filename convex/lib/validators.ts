import { v } from "convex/values";

export const productMarketplaceValidator = v.union(
    v.literal("Ebay"),
    v.literal("Amazon"),
    v.literal("Shopify"),
    v.literal("TikTok")
);

export const syncMarketplaceValidator = v.union(
    v.literal("amazon"),
    v.literal("ebay"),
    v.literal("shopify"),
    v.literal("tiktok")
);

export const breakdownValidator = v.array(
    v.array(v.union(v.string(), v.number()))
);

export const rawFinancialEventsStatusValidator = v.object({
    financeStatusClassification: v.optional(v.string()),
    suggestFinancesV2024Fallback: v.optional(v.boolean()),
    pagesFetched: v.number(),
    usedEstimatedFees: v.boolean(),
    missingFulfillmentDate: v.boolean(),
});

/** Shared fields for marketplace line-item upserts / imports */
export const marketplaceLineItemFields = {
    sku: v.string(),
    name: v.string(),
    price: v.number(),
    fees: v.number(),
    fees_breakdown: v.optional(breakdownValidator),
    shipping: v.number(),
    shipping_breakdown: v.optional(breakdownValidator),
    shippingPercentage: v.optional(v.number()),
    buyerPaidShipping: v.optional(v.number()),
    orderTimestamp: v.number(),
    fulfillmentTimestamp: v.optional(v.number()),
    orderId: v.string(),
};
