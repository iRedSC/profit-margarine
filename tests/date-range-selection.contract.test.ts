import { describe, expect, it } from "vitest";
import {
  previousPeriod,
  recentMonthKeys,
  resolveDateRange,
} from "../src/lib/dateRangeUtils";
import {
  autoGranularity,
  buildItemRankings,
  buildPeriodStats,
  enrichProducts,
  summarize,
} from "../src/lib/statsUtils";
import type { Product } from "../src/types/product";

const iso = (value: number | null) =>
  value === null ? null : new Date(value).toISOString();

describe("date range selection contracts", () => {
  it("resolves a calendar month to its inclusive first and last moments", () => {
    const range = resolveDateRange({ kind: "month", month: "2026-08" });
    expect(iso(range.start)).toBe("2026-08-01T00:00:00.000Z");
    expect(iso(range.end)).toBe("2026-08-31T23:59:59.999Z");
  });

  it("resolves custom ranges inclusively, reversed or open-ended", () => {
    const range = resolveDateRange({
      kind: "custom",
      start: "2026-08-20",
      end: "2026-08-05",
    });
    expect(iso(range.start)).toBe("2026-08-05T00:00:00.000Z");
    expect(iso(range.end)).toBe("2026-08-20T23:59:59.999Z");

    const since = resolveDateRange({
      kind: "custom",
      start: "2026-08-05",
      end: "",
    });
    expect(iso(since.start)).toBe("2026-08-05T00:00:00.000Z");
    expect(since.end).toBeNull();
  });

  it("lists previous full months, newest first", () => {
    expect(recentMonthKeys(3, new Date(2026, 0, 15))).toEqual([
      "2025-12",
      "2025-11",
      "2025-10",
    ]);
  });
});

describe("monthly stats contracts", () => {
  it("buckets orders by calendar month and fills empty months", () => {
    const row = (orderDate: string, price: number): Product => ({
      _id: orderDate as Product["_id"],
      productId: undefined,
      sku: "SKU-1",
      name: "Widget",
      cost: 40,
      marketplace: "Amazon",
      price,
      fees: 10,
      fees_breakdown: undefined,
      shipping: 0,
      shipping_breakdown: undefined,
      shippingPercentage: undefined,
      buyerPaidShipping: undefined,
      orderDate: Date.parse(orderDate),
      fulfillmentDate: undefined,
      orderId: orderDate,
    });

    const stats = buildPeriodStats(
      enrichProducts([
        row("2026-06-30T23:00:00Z", 100),
        row("2026-08-01T00:00:00Z", 100),
        row("2026-08-31T23:59:00Z", 60),
      ]),
      "month",
    );

    expect(stats.map((s) => [s.key, s.orderCount, s.profit])).toEqual([
      ["2026-06", 1, 50],
      ["2026-07", 0, 0],
      ["2026-08", 2, 60],
    ]);
    expect(stats[2].label).toBe("Aug 2026");
  });
});

const at = (value: string) => Date.parse(value);

describe("comparison period contracts", () => {
  const now = at("2026-10-05T16:00:00Z");

  it("compares a whole month with the whole previous month", () => {
    const august = resolveDateRange({ kind: "month", month: "2026-08" });
    const previous = previousPeriod(august.start, august.end, now);
    expect(iso(previous?.start ?? null)).toBe("2026-07-01T00:00:00.000Z");
    expect(iso(previous?.end ?? null)).toBe("2026-07-31T23:59:59.999Z");

    const september = resolveDateRange({ kind: "month", month: "2026-09" });
    const beforeSeptember = previousPeriod(september.start, september.end, now);
    expect(iso(beforeSeptember?.end ?? null)).toBe("2026-08-31T23:59:59.999Z");
  });

  it("compares a month in progress with the same stretch of last month", () => {
    const october = resolveDateRange({ kind: "month", month: "2026-10" });
    const previous = previousPeriod(october.start, october.end, now);
    expect(iso(previous?.start ?? null)).toBe("2026-09-01T00:00:00.000Z");
    expect(iso(previous?.end ?? null)).toBe("2026-09-05T16:00:00.000Z");
  });

  it("compares other ranges with the same stretch of the period before", () => {
    const today = previousPeriod(at("2026-10-05T00:00:00Z"), at("2026-10-05T23:59:59.999Z"), now);
    expect(iso(today?.start ?? null)).toBe("2026-10-04T00:00:00.000Z");
    expect(iso(today?.end ?? null)).toBe("2026-10-04T16:00:00.000Z");

    const custom = resolveDateRange({ kind: "custom", start: "2026-08-05", end: "2026-08-20" });
    const beforeCustom = previousPeriod(custom.start, custom.end, now);
    expect(iso(beforeCustom?.start ?? null)).toBe("2026-07-20T00:00:00.000Z");
    expect(iso(beforeCustom?.end ?? null)).toBe("2026-08-04T23:59:59.999Z");
  });

  it("has nothing to compare for all time or a future range", () => {
    expect(previousPeriod(null, null, now)).toBeNull();
    expect(previousPeriod(at("2026-11-01T00:00:00Z"), null, now)).toBeNull();
  });
});

describe("stats summary contracts", () => {
  const row = (overrides: Partial<Product>): Product => ({
    _id: "row" as Product["_id"],
    productId: undefined,
    sku: "SKU-1",
    name: "Widget",
    cost: 40,
    marketplace: "Amazon",
    price: 100,
    fees: 10,
    fees_breakdown: undefined,
    shipping: 5,
    shipping_breakdown: undefined,
    shippingPercentage: undefined,
    buyerPaidShipping: undefined,
    orderDate: 0,
    fulfillmentDate: undefined,
    orderId: "ORDER",
    ...overrides,
  });

  it("totals included rows and counts the excluded ones", () => {
    const summary = summarize(
      enrichProducts([
        row({}),
        row({ price: 30 }),
        row({ cost: undefined }),
      ]),
    );
    expect(summary).toMatchObject({
      revenue: 130,
      cost: 80,
      fees: 20,
      shipping: 10,
      profit: 20,
      orders: 2,
      lossCount: 1,
      excludedCount: 1,
    });
    expect(summary.margin).toBeCloseTo(15.38, 2);
  });

  it("ranks items by the chosen measure", () => {
    const enriched = enrichProducts([
      row({ sku: "A", price: 100 }),
      row({ sku: "B", price: 30 }),
      row({ sku: "B", price: 30 }),
    ]);
    expect(buildItemRankings(enriched, "units", 10).map((i) => i.sku)).toEqual(["B", "A"]);
    expect(buildItemRankings(enriched, "profit", 10).map((i) => i.sku)).toEqual(["A", "B"]);
    expect(buildItemRankings(enriched, "leastProfit", 1).map((i) => i.sku)).toEqual(["B"]);
    expect(buildItemRankings(enriched, "lossOrders", 10)).toMatchObject([
      { sku: "B", lossCount: 2 },
    ]);
  });

  it("groups by the date the user chose", () => {
    const enriched = enrichProducts([
      row({ orderDate: at("2026-07-31T12:00:00Z"), fulfillmentDate: at("2026-08-02T12:00:00Z") }),
    ]);
    expect(buildPeriodStats(enriched, "month", "orderDate")[0].key).toBe("2026-07");
    expect(buildPeriodStats(enriched, "month", "fulfillmentDate")[0].key).toBe("2026-08");
  });

  it("picks a readable grouping for the range length", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(autoGranularity(0, day)).toBe("hour");
    expect(autoGranularity(0, 31 * day)).toBe("day");
    expect(autoGranularity(0, 90 * day)).toBe("week");
    expect(autoGranularity(0, 365 * day)).toBe("month");
  });
});
