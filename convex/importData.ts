import { Infer, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { requireUserId } from "./lib/auth";
import {
  breakdownValidator,
  productMarketplaceValidator,
} from "./lib/validators";

const dataRowValidator = v.object({
  id: v.optional(v.string()),
  sku: v.string(),
  name: v.optional(v.string()),
  marketplace: productMarketplaceValidator,
  price: v.number(),
  cost: v.optional(v.number()),
  fees: v.number(),
  shipping: v.number(),
  shippingPercentage: v.optional(v.number()),
  buyerPaidShipping: v.optional(v.number()),
  orderDate: v.number(),
  fulfillmentDate: v.optional(v.number()),
  orderId: v.optional(v.string()),
  // Temporary: accept legacy Excel column during OrderId → orderId migration
  OrderId: v.optional(v.string()),
  fees_breakdown: v.optional(breakdownValidator),
  shipping_breakdown: v.optional(breakdownValidator),
});

type DataRow = Infer<typeof dataRowValidator>;

async function ensureProduct(
  ctx: MutationCtx,
  userId: Id<"users">,
  sku: string,
  name: string | undefined,
  cost: number | undefined
): Promise<Id<"products">> {
  const existingProduct = await ctx.db
    .query("products")
    .withIndex("by_user_and_sku", (q) =>
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
  ctx: MutationCtx,
  userId: Id<"users">,
  row: Pick<DataRow, "id" | "marketplace" | "sku" | "orderDate" | "orderId">
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
    .withIndex("by_order_id", (q) => q.eq("orderId", row.orderId))
    .filter((q) =>
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
    const userId = await requireUserId(ctx);

    let updated = 0;
    let created = 0;

    for (const row of args.rows) {
      const orderId = row.orderId || row.OrderId;

      const existing = await findExistingMarketplaceProduct(ctx, userId, {
        id: row.id,
        marketplace: row.marketplace,
        sku: row.sku,
        orderDate: row.orderDate,
        orderId,
      });

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
          ...(orderId !== undefined ? { orderId } : {}),
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
          ...(orderId !== undefined ? { orderId } : {}),
          ...(row.name !== undefined ? { name: row.name } : {}),
        });
        created++;
      }
    }

    return { updated, created };
  },
});
