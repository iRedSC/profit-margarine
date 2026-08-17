import { describe, expect, it } from "vitest";
import type { Product } from "../src/types/product";
import {
  filterProducts,
  isSameProduct,
  sortProducts,
} from "../src/lib/productListUtils";

function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: "row" as Product["_id"],
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
    shippingPercentage: undefined,
    buyerPaidShipping: undefined,
    orderDate: 100,
    fulfillmentDate: undefined,
    orderId: "ORDER-1",
    ...overrides,
  };
}

describe("product-list contracts", () => {
  it("matches catalog products by id and legacy rows by SKU", () => {
    const productId = "catalog-product" as NonNullable<Product["productId"]>;
    expect(isSameProduct(product({ productId }), product({ productId }))).toBe(
      true,
    );
    expect(isSameProduct(product(), product({ sku: "SKU-1" }))).toBe(true);
    expect(isSameProduct(product(), product({ sku: "SKU-2" }))).toBe(false);
  });

  it("filters list views by fulfillment date with order-date fallback", () => {
    const rows = [
      product({ _id: "fallback" as Product["_id"], orderDate: 150 }),
      product({
        _id: "fulfilled" as Product["_id"],
        orderDate: 50,
        fulfillmentDate: 175,
      }),
      product({ _id: "outside" as Product["_id"], orderDate: 50 }),
    ];
    expect(
      filterProducts(rows, {
        marketplaces: new Set(),
        start: 100,
        end: 200,
        dateField: "fulfillmentDate",
      }).map((row) => row._id),
    ).toEqual(["fallback", "fulfilled"]);
  });

  it("keeps stats filtering on order date", () => {
    expect(
      filterProducts(
        [product({ orderDate: 50, fulfillmentDate: 150 })],
        {
          marketplaces: new Set(),
          start: 100,
          end: 200,
          dateField: "orderDate",
        },
      ),
    ).toEqual([]);
  });

  it("combines search and marketplace filters", () => {
    const rows = [
      product({ _id: "amazon" as Product["_id"] }),
      product({
        _id: "ebay" as Product["_id"],
        marketplace: "Ebay",
        sku: "OTHER",
      }),
    ];
    expect(
      filterProducts(rows, {
        search: "widget",
        marketplaces: new Set(["Amazon"]),
        start: null,
        end: null,
        dateField: "fulfillmentDate",
      }).map((row) => row._id),
    ).toEqual(["amazon"]);
  });

  it("uses search relevance before the selected secondary sort", () => {
    const rows = [
      product({ _id: "name" as Product["_id"], sku: "A", name: "Widget" }),
      product({ _id: "sku" as Product["_id"], sku: "WIDGET", name: "A" }),
    ];
    expect(sortProducts(rows, "price", "asc", "widget")[0]._id).toBe("sku");
  });

  it("sorts shipping by net seller cost and omits missing costs for profit", () => {
    const rows = [
      product({
        _id: "net-five" as Product["_id"],
        shipping: 10,
        buyerPaidShipping: 5,
      }),
      product({ _id: "net-six" as Product["_id"], shipping: 6 }),
      product({ _id: "missing" as Product["_id"], cost: undefined }),
    ];
    expect(sortProducts(rows, "shipping", "asc").map((row) => row._id)).toEqual([
      "net-five",
      "net-six",
      "missing",
    ]);
    expect(sortProducts(rows, "profit", "desc").map((row) => row._id)).not.toContain(
      "missing",
    );
  });
});
