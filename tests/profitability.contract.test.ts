import { describe, expect, it } from "vitest";
import type { Product } from "../src/types/product";
import {
  calculateMargin,
  calculateProfit,
  getOrderUrl,
  isOverviewExcluded,
} from "../src/lib/productUtils";
import {
  buildMarketplaceStats,
  buildPeriodStats,
  buildTopLossItems,
  buildTopSoldItems,
  enrichProducts,
} from "../src/lib/statsUtils";
import { formatFeeType, processFeeBreakdown } from "../src/lib/feeUtils";

const DAY = 24 * 60 * 60 * 1_000;

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: "marketplace-product" as Product["_id"],
    productId: undefined,
    sku: "SKU-1",
    name: "Widget",
    cost: 40,
    marketplace: "Amazon",
    price: 100,
    fees: 15,
    fees_breakdown: undefined,
    shipping: 10,
    shipping_breakdown: undefined,
    shippingPercentage: 10,
    buyerPaidShipping: undefined,
    orderDate: Date.UTC(2026, 7, 15, 12),
    fulfillmentDate: undefined,
    orderId: "ORDER-1",
    ...overrides,
  };
}

describe("profitability contracts", () => {
  it("calculates profit and margin from revenue and seller-paid costs", () => {
    expect(calculateProfit(100, 40, 15, 10)).toBe(35);
    expect(calculateMargin(100, 40, 15, 10)).toBe(35);
    expect(calculateMargin(0, 40, 15, 10)).toBe(0);
  });

  it("treats missing cost as zero until the UI marks the result incomplete", () => {
    expect(calculateProfit(100, undefined, 15, 10)).toBe(75);
    expect(enrichProducts([product({ cost: undefined })])[0]).toMatchObject({
      profit: 75,
      margin: 75,
      hasCost: false,
    });
  });

  it("subtracts only net shipping when the buyer paid shipping", () => {
    expect(
      enrichProducts([product({ shipping: 12, buyerPaidShipping: 5 })])[0],
    ).toMatchObject({ netShipping: 7, profit: 38, margin: 38 });
  });

  it("excludes missing costs and estimated shipping from overview totals", () => {
    expect(isOverviewExcluded(product())).toBe(false);
    expect(isOverviewExcluded(product({ cost: undefined }))).toBe(true);
    expect(isOverviewExcluded(product({ shippingEstimated: true }))).toBe(true);
    expect(isOverviewExcluded(product({ shippingEstimated: false }))).toBe(
      false
    );
  });

  it("builds a continuous daily series using order dates and complete costs", () => {
    const start = Date.UTC(2026, 7, 15, 12);
    const enriched = enrichProducts([
      product({ _id: "one" as Product["_id"], orderDate: start }),
      product({
        _id: "two" as Product["_id"],
        orderDate: start + 2 * DAY,
        fulfillmentDate: start + 20 * DAY,
        price: 50,
        cost: 20,
        fees: 5,
        shipping: 5,
      }),
      product({
        _id: "missing-cost" as Product["_id"],
        orderDate: start + DAY,
        cost: undefined,
      }),
      product({
        _id: "estimated-shipping" as Product["_id"],
        orderDate: start + DAY,
        shippingEstimated: true,
      }),
    ]);

    expect(buildPeriodStats(enriched)).toEqual([
      {
        key: "2026-08-15",
        label: "Aug 15",
        revenue: 100,
        cost: 40,
        fees: 15,
        shipping: 10,
        profit: 35,
        margin: 35,
        orderCount: 1,
      },
      {
        key: "2026-08-16",
        label: "Aug 16",
        revenue: 0,
        cost: 0,
        fees: 0,
        shipping: 0,
        profit: 0,
        margin: 0,
        orderCount: 0,
      },
      {
        key: "2026-08-17",
        label: "Aug 17",
        revenue: 50,
        cost: 20,
        fees: 5,
        shipping: 5,
        profit: 20,
        margin: 40,
        orderCount: 1,
      },
    ]);
  });

  it("aggregates marketplace and SKU rankings without inventing missing-cost profit", () => {
    const enriched = enrichProducts([
      product({ _id: "one" as Product["_id"] }),
      product({
        _id: "two" as Product["_id"],
        price: 20,
        cost: 30,
        fees: 2,
        shipping: 3,
      }),
      product({
        _id: "three" as Product["_id"],
        sku: "SKU-2",
        marketplace: "Ebay",
        cost: undefined,
      }),
    ]);

    expect(buildMarketplaceStats(enriched)).toEqual([
      {
        marketplace: "Amazon",
        revenue: 120,
        profit: 20,
        orderCount: 2,
        lossCount: 1,
      },
    ]);
    expect(buildTopSoldItems(enriched, 1)[0]).toMatchObject({
      sku: "SKU-1",
      unitsSold: 2,
      revenue: 120,
      profit: 20,
      lossCount: 1,
    });
    expect(buildTopLossItems(enriched, 1)[0]).toMatchObject({
      sku: "SKU-1",
      lossCount: 1,
      totalLoss: 15,
    });
  });
});

describe("display contracts", () => {
  it("formats and identifies estimated fee lines", () => {
    expect(formatFeeType("Referral_Fee (Estimated 15%)")).toBe(
      "Referral Fee",
    );
    expect(
      processFeeBreakdown(
        [
          ["Amazon Fee (Estimated 15%)", 15],
          ["ignored", 0],
        ],
      ),
    ).toEqual({
      fees: [
        {
          type: "Amazon Fee",
          rawType: "Amazon Fee (Estimated 15%)",
          amount: 15,
          isEstimated: true,
        },
      ],
      hasEstimatedFees: true,
    });
  });

  it.each([
    ["Amazon", "https://sellercentral.amazon.com/orders-v3/order/ORDER-1"],
    ["Ebay", "https://www.ebay.com/sh/ord/details?orderid=ORDER-1"],
    [
      "TikTok",
      "https://seller-us.tiktok.com/order/detail?order_no=ORDER-1&shop_region=US",
    ],
  ])("builds the %s order URL", (marketplace, expected) => {
    expect(getOrderUrl(marketplace, "ORDER-1", undefined)).toBe(expected);
  });

  it("requires both a Shopify domain and an order id", () => {
    expect(getOrderUrl("Shopify", "123", "shop.myshopify.com")).toBe(
      "https://shop.myshopify.com/admin/orders/123",
    );
    expect(getOrderUrl("Shopify", "123", undefined)).toBeNull();
    expect(getOrderUrl("Amazon", undefined, undefined)).toBeNull();
  });
});
