import { afterEach, describe, expect, it, vi } from "vitest";
import { getDateRange, isDateRangeType } from "../src/lib/dateRangeUtils";
import {
  calculateMatchScore,
  getSearchScore,
  searchProduct,
} from "../src/lib/searchUtils";
import {
  shippingPercentageOfPrice,
  splitOrderCosts,
  toPerUnitBreakdown,
} from "../convex/lib/orderCosts";
import {
  isProductMarketplace,
  toProductMarketplace,
  toSyncMarketplace,
} from "../convex/lib/marketplace";

afterEach(() => vi.useRealTimers());

describe("date filter contracts", () => {
  it("uses inclusive UTC day and Saturday-to-Friday week boundaries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-17T12:34:56.000Z"));

    const today = getDateRange("today");
    expect(new Date(today.start ?? 0).toISOString()).toBe(
      "2026-08-17T00:00:00.000Z",
    );
    expect(new Date(today.end ?? 0).toISOString()).toBe(
      "2026-08-17T23:59:59.999Z",
    );

    const week = getDateRange("thisWeek");
    expect(new Date(week.start ?? 0).toISOString()).toBe(
      "2026-08-15T00:00:00.000Z",
    );
    expect(new Date(week.end ?? 0).toISOString()).toBe(
      "2026-08-21T23:59:59.999Z",
    );
    expect(isDateRangeType(week.start, week.end, "thisWeek")).toBe(true);
  });

  it("represents all time with null boundaries", () => {
    expect(getDateRange("allTime")).toEqual({ start: null, end: null });
    expect(isDateRangeType(null, null, "allTime")).toBe(true);
  });
});

describe("search contracts", () => {
  it("ranks exact SKU matches ahead of name matches", () => {
    expect(getSearchScore("widget", "WIDGET", "Other")).toBeGreaterThan(
      getSearchScore("widget", "OTHER", "Widget"),
    );
  });

  it("supports short typo-tolerant matches without matching unrelated text", () => {
    expect(searchProduct("widgt", "WIDGET-1", undefined)).toBe(true);
    expect(searchProduct("xyz", "WIDGET-1", "Useful Widget")).toBe(false);
    expect(calculateMatchScore("", "anything")).toBe(1_000);
  });
});

describe("marketplace and order-cost contracts", () => {
  it.each([
    ["Amazon", "amazon"],
    ["Ebay", "ebay"],
    ["Shopify", "shopify"],
    ["TikTok", "tiktok"],
  ] as const)("maps %s identifiers both ways", (productName, syncName) => {
    expect(toSyncMarketplace(productName)).toBe(syncName);
    expect(toProductMarketplace(syncName)).toBe(productName);
    expect(isProductMarketplace(productName)).toBe(true);
  });

  it("rejects unknown marketplaces", () => {
    expect(() => toSyncMarketplace("etsy")).toThrow(
      "Unknown marketplace: etsy",
    );
    expect(isProductMarketplace("etsy")).toBe(false);
  });

  it("splits order costs per unit and guards invalid quantities", () => {
    expect(
      splitOrderCosts({ totalShipping: 12, totalBuyerPaid: 3, totalQty: 3 }),
    ).toEqual({ shippingPerUnit: 4, buyerPaidPerUnit: 1 });
    expect(splitOrderCosts({ totalShipping: 12, totalQty: 0 })).toEqual({
      shippingPerUnit: 12,
      buyerPaidPerUnit: 0,
    });
    expect(toPerUnitBreakdown([["Label", 12]], 3)).toEqual([["Label", 4]]);
    expect(shippingPercentageOfPrice(5, 20)).toBe(25);
    expect(shippingPercentageOfPrice(5, 0)).toBe(0);
  });
});
