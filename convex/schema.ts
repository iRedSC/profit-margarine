import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

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
    marketplace: v.union(
      v.literal("Ebay"),
      v.literal("Amazon"),
      v.literal("Shopify"),
      v.literal("TikTok")
    ),
    price: v.number(),
    cost: v.optional(v.number()),
    fees: v.number(),
    fees_breakdown: v.optional(v.array(v.array(v.union(v.string(), v.number())))),
    shipping: v.number(),
    shippingPercentage: v.optional(v.number()),
    buyerPaidShipping: v.optional(v.number()),
    orderDate: v.number(),
    fulfillmentDate: v.optional(v.number()),
    userId: v.id("users"),
    orderId: v.optional(v.string()),
    OrderId: v.optional(v.string()),
    sku: v.optional(v.string()),
    name: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_product", ["productId"])
    .index("by_order_id", ["orderId"]),

  syncs: defineTable({
    userId: v.id("users"),
    marketplace: v.union(
      v.literal("amazon"),
      v.literal("ebay"),
      v.literal("shopify")
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
  })
    .index("by_ebay_user_id", ["ebayUserId"]),

  marketplaceConnections: defineTable({
    userId: v.id("users"),
    marketplace: v.union(v.literal("shopify"), v.literal("ebay"), v.literal("tiktok")),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    shopDomain: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    connectedAt: v.number(),
  })
    .index("by_user_and_marketplace", ["userId", "marketplace"]),

  shopifyConnections: defineTable({
    shop: v.string(),
    accessToken: v.string(),
    scope: v.string(),
    connectedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shop", ["shop"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
