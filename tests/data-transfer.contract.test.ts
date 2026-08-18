import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_COLUMNS,
  parseDataRowsFromSheet,
  productCostsToExportSheet,
  productRowsToExportSheet,
} from "../src/lib/dataImportExport";

describe("profitability data transfer contract", () => {
  it("round-trips every supported data column", () => {
    const exported = productRowsToExportSheet([
      {
        _id: "row-1",
        sku: "SKU-1",
        name: "Widget",
        marketplace: "Amazon",
        price: 99.95,
        cost: 40,
        fees: 14.99,
        shipping: 8.5,
        shippingPercentage: 8.5,
        buyerPaidShipping: 2,
        orderDate: Date.UTC(2026, 7, 15, 12),
        fulfillmentDate: Date.UTC(2026, 7, 16, 12),
        orderId: "ORDER-1",
        fees_breakdown: [["Referral Fee", 14.99]],
        shipping_breakdown: [["Label", 8.5]],
      },
    ]);

    expect(Object.keys(exported[0])).toEqual(DATA_EXPORT_COLUMNS);
    expect(parseDataRowsFromSheet(exported)).toEqual([
      {
        id: "row-1",
        sku: "SKU-1",
        name: "Widget",
        marketplace: "Amazon",
        price: 99.95,
        cost: 40,
        fees: 14.99,
        shipping: 8.5,
        shippingPercentage: 8.5,
        buyerPaidShipping: 2,
        orderDate: Date.UTC(2026, 7, 15, 12),
        fulfillmentDate: Date.UTC(2026, 7, 16, 12),
        orderId: "ORDER-1",
        fees_breakdown: [["Referral Fee", 14.99]],
        shipping_breakdown: [["Label", 8.5]],
      },
    ]);
  });

  it("accepts legacy headers, marketplace casing, and Excel serial dates", () => {
    expect(
      parseDataRowsFromSheet([
        {
          SKU: " legacy-sku ",
          Marketplace: "ebay",
          Price: "12.50",
          "Order Date": 45_000,
          OrderId: "legacy-order",
        },
      ]),
    ).toEqual([
      {
        sku: "legacy-sku",
        marketplace: "Ebay",
        price: 12.5,
        fees: 0,
        shipping: 0,
        orderDate: Math.round((45_000 - 25_569) * 86_400 * 1_000),
        orderId: "legacy-order",
      },
    ]);
  });

  it("skips invalid rows and rejects files missing required columns", () => {
    expect(
      parseDataRowsFromSheet([
        { sku: "", marketplace: "Amazon", price: 10, orderDate: 1 },
        { sku: "SKU", marketplace: "Unknown", price: 10, orderDate: 1 },
      ]),
    ).toEqual([]);
    expect(() => parseDataRowsFromSheet([{ sku: "SKU" }])).toThrow(
      "Could not find required columns: sku, marketplace, price, orderDate",
    );
  });

  it("preserves zero costs and leaves missing costs blank", () => {
    expect(
      productCostsToExportSheet([
        { sku: "FREE", cost: 0 },
        { sku: "UNKNOWN", name: "Unknown cost" },
      ]),
    ).toEqual([
      { sku: "FREE", name: "", cost: 0 },
      { sku: "UNKNOWN", name: "Unknown cost", cost: "" },
    ]);
  });
});
