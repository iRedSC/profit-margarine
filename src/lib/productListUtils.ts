import type { Product } from "../types/product";
import { getSearchScore, searchProduct } from "./searchUtils";
import {
  calculateMargin,
  calculateProfit,
  getNetShipping,
  type SortDirection,
  type SortField,
} from "./productUtils";

export type ProductDateField = "orderDate" | "fulfillmentDate";

export type ProductFilters = {
  search?: string;
  marketplaces: ReadonlySet<string>;
  start: number | null;
  end: number | null;
  dateField: ProductDateField;
};

export function isSameProduct(a: Product, b: Product): boolean {
  return a.productId && b.productId
    ? a.productId === b.productId
    : a.sku === b.sku;
}

export function filterProducts(
  products: Product[],
  filters: ProductFilters,
): Product[] {
  return products.filter((product) => {
    if (
      filters.search &&
      !searchProduct(filters.search, product.sku, product.name)
    ) {
      return false;
    }
    if (
      filters.marketplaces.size > 0 &&
      !filters.marketplaces.has(product.marketplace)
    ) {
      return false;
    }

    const date =
      filters.dateField === "orderDate"
        ? product.orderDate
        : (product.fulfillmentDate ?? product.orderDate);
    return (
      (filters.start === null || date >= filters.start) &&
      (filters.end === null || date <= filters.end)
    );
  });
}

function sortValue(product: Product, field: SortField): string | number {
  const netShipping = getNetShipping(product);
  switch (field) {
    case "profit":
      return calculateProfit(product.price, product.cost, product.fees, netShipping);
    case "margin":
      return calculateMargin(product.price, product.cost, product.fees, netShipping);
    case "cost":
      return product.cost ?? -Infinity;
    case "shipping":
      return netShipping;
    case "fulfillmentDate":
      return product.fulfillmentDate ?? product.orderDate;
    default:
      return product[field] ?? "";
  }
}

export function sortProducts(
  products: Product[],
  field: SortField,
  direction: SortDirection,
  search = "",
): Product[] {
  const sortable =
    field === "profit" || field === "margin"
      ? products.filter((product) => product.cost !== undefined)
      : products;
  const multiplier = direction === "asc" ? 1 : -1;

  return [...sortable].sort((a, b) => {
    if (search) {
      const scoreDifference =
        getSearchScore(search, b.sku, b.name) -
        getSearchScore(search, a.sku, a.name);
      if (scoreDifference !== 0) return scoreDifference;
    }

    const aValue = sortValue(a, field);
    const bValue = sortValue(b, field);
    if (typeof aValue === "string" && typeof bValue === "string") {
      return aValue.localeCompare(bValue) * multiplier;
    }
    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * multiplier;
    }
    return 0;
  });
}
