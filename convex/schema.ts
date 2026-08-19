import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
    breakdownValidator,
    productMarketplaceValidator,
    rawFinancialEventsStatusValidator,
    tiktokFinanceStatusValidator,
} from "./lib/validators";

const applicationTables = {
    products: defineTable({
        sku: v.string(),
        name: v.optional(v.string()),
        cost: v.optional(v.number()),
        userId: v.id("users"),
    })
        .index("by_user", ["userId"])
        .index("by_user_and_sku", ["userId", "sku"]),

    marketplaceProducts: defineTable({
        productId: v.optional(v.id("products")),
        marketplace: productMarketplaceValidator,
        price: v.number(),
        cost: v.optional(v.number()),
        fees: v.number(),
        fees_breakdown: v.optional(breakdownValidator),
        shipping: v.number(),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        tiktokFinanceStatus: v.optional(tiktokFinanceStatusValidator),
        shippingEstimated: v.optional(v.boolean()),
        shipping_breakdown: v.optional(breakdownValidator),
        orderDate: v.number(),
        fulfillmentDate: v.optional(v.number()),
        userId: v.id("users"),
        orderId: v.optional(v.string()),
        sku: v.optional(v.string()),
        name: v.optional(v.string()),
    })
        .index("by_user", ["userId"])
        .index("by_product", ["productId"])
        .index("by_order_id", ["orderId"]),

    pendingMarketplaceImports: defineTable({
        userId: v.id("users"),
        marketplace: productMarketplaceValidator,
        status: v.union(v.literal("pending"), v.literal("resolved")),
        orderId: v.string(),
        sku: v.string(),
        name: v.string(),
        quantity: v.number(),
        price: v.number(),
        fees: v.number(),
        fees_breakdown: v.optional(breakdownValidator),
        shipping: v.number(),
        shippingPercentage: v.optional(v.number()),
        buyerPaidShipping: v.optional(v.number()),
        shipping_breakdown: v.optional(breakdownValidator),
        orderDate: v.number(),
        fulfillmentDate: v.optional(v.number()),
        reasonCode: v.string(),
        reasonMessage: v.string(),
        rawFinancialEventsStatus: v.optional(rawFinancialEventsStatusValidator),
        lastAttemptAt: v.number(),
        resolvedAt: v.optional(v.number()),
    })
        .index("by_user", ["userId"])
        .index("by_order_id", ["orderId"])
        .index("by_user_marketplace_status", [
            "userId",
            "marketplace",
            "status",
        ]),

    syncs: defineTable({
        userId: v.id("users"),
        marketplace: v.union(
            v.literal("amazon"),
            v.literal("ebay"),
            v.literal("shopify"),
            v.literal("tiktok")
        ),
        status: v.union(
            v.literal("active"),
            v.literal("canceled"),
            v.literal("finished")
        ),
        total: v.number(),
        complete: v.number(),
        message: v.optional(v.string()),
        startedAt: v.number(),
        finishedAt: v.optional(v.number()),
        error: v.optional(v.string()),
    })
        .index("by_user", ["userId"])
        .index("by_user_and_status", ["userId", "status"])
        .index("by_user_and_marketplace", ["userId", "marketplace"]),

    ebayAccountDeletions: defineTable({
        ebayUserId: v.string(),
        username: v.string(),
        deletionDate: v.string(),
        notificationData: v.string(),
        processedAt: v.number(),
        verified: v.boolean(),
    }).index("by_ebay_user_id", ["ebayUserId"]),

    marketplaceConnections: defineTable({
        userId: v.id("users"),
        marketplace: v.union(
            v.literal("shopify"),
            v.literal("ebay"),
            v.literal("tiktok")
        ),
        accessToken: v.string(),
        refreshToken: v.optional(v.string()),
        shopDomain: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        connectedAt: v.number(),
    }).index("by_user_and_marketplace", ["userId", "marketplace"]),
};

export default defineSchema({
    ...authTables,
    ...applicationTables,
});
