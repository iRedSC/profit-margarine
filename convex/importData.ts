import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

const marketplaceValidator = v.union(
  v.literal("Ebay"),
  v.literal("Amazon"),
  v.literal("Shopify"),
  v.literal("TikTok")
);

const dataRowValidator = v.object({
  id: v.optional(v.string()),
  sku: v.string(),
  name: v.optional(v.string()),
  marketplace: marketplaceValidator,
  price: v.number(),
  cost: v.optional(v.number()),
  fees: v.number(),
  shipping: v.number(),
  shippingPercentage: v.optional(v.number()),
  buyerPaidShipping: v.optional(v.number()),
  orderDate: v.number(),
  fulfillmentDate: v.optional(v.number()),
  orderId: v.optional(v.string()),
  OrderId: v.optional(v.string()),
  fees_breakdown: v.optional(
    v.array(v.array(v.union(v.string(), v.number())))
  ),
  shipping_breakdown: v.optional(
    v.array(v.array(v.union(v.string(), v.number())))
  ),
});

async function ensureProduct(
  ctx: any,
  userId: Id<"users">,
  sku: string,
  name: string | undefined,
  cost: number | undefined
): Promise<Id<"products">> {
  const existingProduct = await ctx.db
    .query("products")
    .withIndex("by_user_and_sku", (q: any) =>
      q.eq("userId", userId).eq("sku", sku)
    )
    .first();

  if (existingProduct) {
    const patch: { name?: string; cost?: number } = {};
    if (name && name !== existingProduct.name) {
      patch.name = name;
    }
    if (cost !== undefined && existingProduct.cost === undefined) {
      patch.cost = cost;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existingProduct._id, patch);
    }
    return existingProduct._id;
  }

  return await ctx.db.insert("products", {
    sku,
    name,
    cost,
    userId,
  });
}

async function findExistingMarketplaceProduct(
  ctx: any,
  userId: Id<"users">,
  row: {
    id?: string;
    marketplace: "Ebay" | "Amazon" | "Shopify" | "TikTok";
    sku: string;
    orderDate: number;
    orderId?: string;
  }
) {
  if (row.id) {
    try {
      const byId = await ctx.db.get(row.id as Id<"marketplaceProducts">);
      if (byId && byId.userId === userId) {
        return byId;
      }
    } catch {
      // Invalid id format — fall through to order matching
    }
  }

  if (!row.orderId) {
    return null;
  }

  const matches = await ctx.db
    .query("marketplaceProducts")
    .withIndex("by_order_id", (q: any) => q.eq("orderId", row.orderId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field("userId"), userId),
        q.eq(q.field("orderDate"), row.orderDate),
        q.eq(q.field("sku"), row.sku),
        q.eq(q.field("marketplace"), row.marketplace)
      )
    )
    .collect();

  return matches[0] ?? null;
}

export const importMarketplaceProducts = mutation({
  args: {
    rows: v.array(dataRowValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    let updated = 0;
    let created = 0;

    for (const row of args.rows) {
      const existing = await findExistingMarketplaceProduct(ctx, userId, row);

      const productId = await ensureProduct(
        ctx,
        userId,
        row.sku,
        row.name,
        row.cost
      );

      if (existing) {
        await ctx.db.patch(existing._id, {
          productId,
          marketplace: row.marketplace,
          price: row.price,
          fees: row.fees,
          shipping: row.shipping,
          orderDate: row.orderDate,
          sku: row.sku,
          ...(row.cost !== undefined ? { cost: row.cost } : {}),
          ...(row.fees_breakdown !== undefined
            ? { fees_breakdown: row.fees_breakdown }
            : {}),
          ...(row.shippingPercentage !== undefined
            ? { shippingPercentage: row.shippingPercentage }
            : {}),
          ...(row.buyerPaidShipping !== undefined
            ? { buyerPaidShipping: row.buyerPaidShipping }
            : {}),
          ...(row.shipping_breakdown !== undefined
            ? { shipping_breakdown: row.shipping_breakdown }
            : {}),
          ...(row.fulfillmentDate !== undefined
            ? { fulfillmentDate: row.fulfillmentDate }
            : {}),
          ...(row.orderId !== undefined ? { orderId: row.orderId } : {}),
          ...(row.OrderId !== undefined ? { OrderId: row.OrderId } : {}),
          ...(row.name !== undefined ? { name: row.name } : {}),
        });
        updated++;
      } else {
        await ctx.db.insert("marketplaceProducts", {
          productId,
          marketplace: row.marketplace,
          price: row.price,
          fees: row.fees,
          shipping: row.shipping,
          orderDate: row.orderDate,
          sku: row.sku,
          userId,
          ...(row.cost !== undefined ? { cost: row.cost } : {}),
          ...(row.fees_breakdown !== undefined
            ? { fees_breakdown: row.fees_breakdown }
            : {}),
          ...(row.shippingPercentage !== undefined
            ? { shippingPercentage: row.shippingPercentage }
            : {}),
          ...(row.buyerPaidShipping !== undefined
            ? { buyerPaidShipping: row.buyerPaidShipping }
            : {}),
          ...(row.shipping_breakdown !== undefined
            ? { shipping_breakdown: row.shipping_breakdown }
            : {}),
          ...(row.fulfillmentDate !== undefined
            ? { fulfillmentDate: row.fulfillmentDate }
            : {}),
          ...(row.orderId !== undefined ? { orderId: row.orderId } : {}),
          ...(row.OrderId !== undefined ? { OrderId: row.OrderId } : {}),
          ...(row.name !== undefined ? { name: row.name } : {}),
        });
        created++;
      }
    }

    return { updated, created };
  },
});
