import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../convex/schema";
import { internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { OrderLine } from "../convex/products/mutations";

const modules = import.meta.glob("../convex/**/!(*.*.*)*.*s");

const ORDER = { orderId: "order-1", orderTimestamp: 1_700_000_000_000 };

function line(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    sku: "SKU-A",
    name: "Widget",
    quantity: 1,
    price: 20,
    fees: 3,
    shipping: 5,
    ...overrides,
  };
}

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", {}));
  const replace = (
    lines: OrderLine[],
    extra: { marketplace?: "Ebay" | "Amazon" | "Shopify" | "TikTok"; retainSkus?: string[]; fulfillmentTimestamp?: number } = {},
  ) =>
    t.mutation(internal.products.replaceOrderRows, {
      userId,
      marketplace: extra.marketplace ?? "Shopify",
      ...ORDER,
      fulfillmentTimestamp: extra.fulfillmentTimestamp ?? ORDER.orderTimestamp + 1,
      retainSkus: extra.retainSkus,
      lines,
    });
  const rows = () =>
    t.run((ctx) =>
      ctx.db
        .query("marketplaceProducts")
        .withIndex("by_order_id", (q) => q.eq("orderId", ORDER.orderId))
        .collect(),
    );
  return { t, userId, replace, rows };
}

describe("replaceOrderRows", () => {
  it("writes one row per unit of quantity", async () => {
    const { replace, rows } = await setup();
    await replace([line({ quantity: 3 })]);
    expect(await rows()).toHaveLength(3);
  });

  it("shrinks and grows to the new quantity on resync", async () => {
    const { replace, rows } = await setup();
    await replace([line({ quantity: 3 })]);
    await replace([line({ quantity: 1 })]);
    expect(await rows()).toHaveLength(1);
    await replace([line({ quantity: 2 })]);
    expect(await rows()).toHaveLength(2);
  });

  it("keeps distinct lines with the same SKU as separate units", async () => {
    const { replace, rows } = await setup();
    await replace([line({ price: 10 }), line({ price: 30, quantity: 2 })]);
    expect((await rows()).map((r) => r.price).sort()).toEqual([10, 30, 30]);
  });

  it("updates rows in place, keeping ids and user-set costs", async () => {
    const { t, replace, rows } = await setup();
    await replace([line({ quantity: 3 })]);
    const before = await rows();
    await t.run(async (ctx) => {
      await ctx.db.patch(before[0]._id, { cost: 40 });
      await ctx.db.patch(before[1]._id, { cost: 10 });
      await ctx.db.patch(before[0].productId!, { cost: 12 });
    });

    await replace([line({ quantity: 3, fees: 4 })]);

    const after = await rows();
    expect(after.map((r) => r._id)).toEqual(before.map((r) => r._id));
    expect(after.map((r) => r.cost)).toEqual([40, 10, 12]);
    expect(after.every((r) => r.fees === 4)).toBe(true);
  });

  it("seeds new rows with the catalog cost", async () => {
    const { t, userId, replace, rows } = await setup();
    await t.run((ctx) =>
      ctx.db.insert("products", { userId, sku: "SKU-A", name: "Widget", cost: 7 }),
    );
    await replace([line({ quantity: 2 })]);
    expect((await rows()).map((r) => r.cost)).toEqual([7, 7]);
  });

  it("deletes rows for SKUs that left the order, except retained ones", async () => {
    const { replace, rows } = await setup();
    await replace(
      [line({ sku: "SKU-A" }), line({ sku: "SKU-B" }), line({ sku: "SKU-C" })],
      { marketplace: "Amazon" },
    );
    await replace([line({ sku: "SKU-A" })], {
      marketplace: "Amazon",
      retainSkus: ["SKU-B"],
    });
    expect((await rows()).map((r) => r.sku).sort()).toEqual(["SKU-A", "SKU-B"]);
  });

  it("leaves unimportable lines' existing rows alone", async () => {
    const { t, userId, rows } = await setup();
    const write = (shipping: number, fulfillmentTimestamp?: number) =>
      t.mutation(internal.products.replaceOrderRows, {
        userId,
        marketplace: "Shopify",
        ...ORDER,
        fulfillmentTimestamp,
        lines: [line({ shipping })],
      });
    await write(0);
    expect(await rows()).toHaveLength(0);
    await write(5, ORDER.orderTimestamp + 1);
    await write(0);
    expect(await rows()).toHaveLength(1);
  });

  it("only touches the given user and marketplace", async () => {
    const { t, replace, rows } = await setup();
    const otherUser: Id<"users"> = await t.run((ctx) => ctx.db.insert("users", {}));
    await t.mutation(internal.products.replaceOrderRows, {
      userId: otherUser,
      marketplace: "Shopify",
      ...ORDER,
      fulfillmentTimestamp: ORDER.orderTimestamp + 1,
      lines: [line()],
    });
    await replace([line()], { marketplace: "Ebay" });
    await replace([], { marketplace: "Shopify" });
    expect(await rows()).toHaveLength(2);
  });
});
