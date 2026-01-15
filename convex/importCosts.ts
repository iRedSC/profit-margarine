import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const importProductCosts = mutation({
  args: {
    products: v.array(v.object({
      sku: v.string(),
      cost: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    let updated = 0;
    let created = 0;

    for (const item of args.products) {
      const existingProduct = await ctx.db
        .query("products")
        .withIndex("by_user_and_sku", (q) => q.eq("userId", userId).eq("sku", item.sku))
        .first();

      if (existingProduct) {
        await ctx.db.patch(existingProduct._id, { cost: item.cost });
        
        const marketplaceProducts = await ctx.db
          .query("marketplaceProducts")
          .withIndex("by_product", (q) => q.eq("productId", existingProduct._id))
          .collect();
        
        for (const mp of marketplaceProducts) {
          if (mp.cost === undefined) {
            await ctx.db.patch(mp._id, { cost: item.cost });
          }
        }
        
        updated++;
      } else {
        await ctx.db.insert("products", {
          sku: item.sku,
          cost: item.cost,
          userId,
        });
        created++;
      }
    }

    return { updated, created };
  },
});
