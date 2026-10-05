import { describe, expect, it } from "vitest";
import {
  COST_SETTLEMENT_WINDOW_MS,
  isCostRefreshDue,
  missingCosts,
  type CostFields,
} from "../convex/lib/costCompleteness";
import {
  AMAZON_ESTIMATED_FEE_LABEL,
  EBAY_ESTIMATED_FEE_LABEL,
} from "../convex/lib/orderCosts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const complete: CostFields = {
  marketplace: "Ebay",
  fees: 3.1,
  fees_breakdown: [["Final Value Fee", 3.1]],
  shipping: 4.5,
};

describe("which orders still need costs", () => {
  it("treats real fees and a paid label as complete", () => {
    expect(missingCosts(complete)).toEqual([]);
  });

  it("flags estimated fees from any marketplace", () => {
    expect(
      missingCosts({
        ...complete,
        fees_breakdown: [[EBAY_ESTIMATED_FEE_LABEL, 2]],
      })
    ).toEqual(["fees"]);
    expect(
      missingCosts({
        ...complete,
        marketplace: "Amazon",
        fees_breakdown: [[AMAZON_ESTIMATED_FEE_LABEL, 2]],
      })
    ).toEqual(["fees"]);
  });

  it("flags TikTok orders until finance settles", () => {
    const tiktok = { ...complete, marketplace: "TikTok" as const };
    expect(missingCosts({ ...tiktok, tiktokFinanceStatus: "unsettled" })).toEqual(
      ["fees"]
    );
    expect(missingCosts({ ...tiktok, tiktokFinanceStatus: "settled" })).toEqual(
      []
    );
  });

  it("flags Shopify orders with no fees yet (ShopifyQL lag)", () => {
    expect(
      missingCosts({ ...complete, marketplace: "Shopify", fees: 0, fees_breakdown: [] })
    ).toEqual(["fees"]);
  });

  it("flags zero or estimated shipping, except pickup", () => {
    expect(missingCosts({ ...complete, shipping: 0 })).toEqual(["shipping"]);
    expect(missingCosts({ ...complete, shippingEstimated: true })).toEqual([
      "shipping",
    ]);
    expect(missingCosts({ ...complete, shipping: 0, isPickup: true })).toEqual(
      []
    );
  });
});

describe("when to ask the marketplace again", () => {
  const now = 100 * DAY;

  it("rechecks a fresh order after an hour, not sooner", () => {
    const orderDate = now - 2 * HOUR;
    expect(isCostRefreshDue({ orderDate, lastCheckedAt: now - 30 * 60 * 1000, now })).toBe(false);
    expect(isCostRefreshDue({ orderDate, lastCheckedAt: now - HOUR, now })).toBe(true);
  });

  it("backs off to a quarter of the order's age", () => {
    const orderDate = now - 2 * DAY;
    expect(isCostRefreshDue({ orderDate, lastCheckedAt: now - 11 * HOUR, now })).toBe(false);
    expect(isCostRefreshDue({ orderDate, lastCheckedAt: now - 12 * HOUR, now })).toBe(true);
  });

  it("caps the interval at one day", () => {
    const orderDate = now - 10 * DAY;
    expect(isCostRefreshDue({ orderDate, lastCheckedAt: now - DAY, now })).toBe(true);
  });

  it("gives up after the settlement window", () => {
    expect(
      isCostRefreshDue({
        orderDate: now - COST_SETTLEMENT_WINDOW_MS - HOUR,
        lastCheckedAt: 0,
        now,
      })
    ).toBe(false);
  });
});
