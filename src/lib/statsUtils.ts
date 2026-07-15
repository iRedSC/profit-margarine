import { calculateMargin, calculateProfit } from "./productUtils";
import { Product } from "../types/product";

export type EnrichedProduct = Product & {
  netShipping: number;
  profit: number;
  margin: number;
  hasCost: boolean;
  dayKey: string;
};

export type DailyStats = {
  date: string;
  label: string;
  revenue: number;
  cost: number;
  fees: number;
  shipping: number;
  profit: number;
  margin: number;
  orderCount: number;
};

export type MarketplaceStats = {
  marketplace: string;
  revenue: number;
  profit: number;
  orderCount: number;
  lossCount: number;
};

export type SkuRanking = {
  key: string;
  sku: string;
  name: string;
  unitsSold: number;
  revenue: number;
  profit: number;
  lossCount: number;
  totalLoss: number;
  orderCount: number;
};

function getNetShipping(product: Product): number {
  return product.buyerPaidShipping !== undefined
    ? product.shipping - product.buyerPaidShipping
    : product.shipping;
}

function toDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function enrichProducts(products: Product[]): EnrichedProduct[] {
  return products.map((product) => {
    const netShipping = getNetShipping(product);
    const hasCost = product.cost !== undefined;
    const profit = calculateProfit(
      product.price,
      product.cost,
      product.fees,
      netShipping
    );
    const margin = calculateMargin(
      product.price,
      product.cost,
      product.fees,
      netShipping
    );
    const filterDate = product.fulfillmentDate ?? product.orderDate;

    return {
      ...product,
      netShipping,
      profit,
      margin,
      hasCost,
      dayKey: toDayKey(filterDate),
    };
  });
}

export function buildDailyStats(products: EnrichedProduct[]): DailyStats[] {
  const byDay = new Map<
    string,
    {
      revenue: number;
      cost: number;
      fees: number;
      shipping: number;
      profit: number;
      orderCount: number;
    }
  >();

  for (const product of products) {
    if (!product.hasCost) continue;

    const existing = byDay.get(product.dayKey) ?? {
      revenue: 0,
      cost: 0,
      fees: 0,
      shipping: 0,
      profit: 0,
      orderCount: 0,
    };

    existing.revenue += product.price;
    existing.cost += product.cost || 0;
    existing.fees += product.fees;
    existing.shipping += product.netShipping;
    existing.profit += product.profit;
    existing.orderCount += 1;
    byDay.set(product.dayKey, existing);
  }

  if (byDay.size === 0) {
    return [];
  }

  const sortedKeys = Array.from(byDay.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  const filledKeys = fillDayKeys(sortedKeys[0], sortedKeys[sortedKeys.length - 1]);

  return filledKeys.map((date) => {
    const stats = byDay.get(date) ?? {
      revenue: 0,
      cost: 0,
      fees: 0,
      shipping: 0,
      profit: 0,
      orderCount: 0,
    };

    return {
      date,
      label: formatDayLabel(date),
      revenue: roundMoney(stats.revenue),
      cost: roundMoney(stats.cost),
      fees: roundMoney(stats.fees),
      shipping: roundMoney(stats.shipping),
      profit: roundMoney(stats.profit),
      margin:
        stats.revenue > 0
          ? roundMoney((stats.profit / stats.revenue) * 100)
          : 0,
      orderCount: stats.orderCount,
    };
  });
}

function fillDayKeys(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endKey.split("-").map(Number);
  const cursor = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    const day = String(cursor.getDate()).padStart(2, "0");
    keys.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

export function buildMarketplaceStats(
  products: EnrichedProduct[]
): MarketplaceStats[] {
  const byMarketplace = new Map<
    string,
    {
      revenue: number;
      profit: number;
      orderCount: number;
      lossCount: number;
    }
  >();

  for (const product of products) {
    if (!product.hasCost) continue;

    const existing = byMarketplace.get(product.marketplace) ?? {
      revenue: 0,
      profit: 0,
      orderCount: 0,
      lossCount: 0,
    };

    existing.revenue += product.price;
    existing.profit += product.profit;
    existing.orderCount += 1;
    if (product.profit < 0) {
      existing.lossCount += 1;
    }
    byMarketplace.set(product.marketplace, existing);
  }

  return Array.from(byMarketplace.entries())
    .map(([marketplace, stats]) => ({
      marketplace,
      revenue: roundMoney(stats.revenue),
      profit: roundMoney(stats.profit),
      orderCount: stats.orderCount,
      lossCount: stats.lossCount,
    }))
    .sort((a, b) => b.profit - a.profit);
}

function getSkuKey(product: EnrichedProduct): string {
  if (product.productId) return `id:${product.productId}`;
  if (product.sku) return `sku:${product.sku}`;
  return `name:${product.name ?? "Unknown"}`;
}

function buildSkuAggregates(products: EnrichedProduct[]): SkuRanking[] {
  const bySku = new Map<
    string,
    {
      sku: string;
      name: string;
      unitsSold: number;
      revenue: number;
      profit: number;
      lossCount: number;
      totalLoss: number;
      orderCount: number;
    }
  >();

  for (const product of products) {
    const key = getSkuKey(product);
    const existing = bySku.get(key) ?? {
      sku: product.sku || "—",
      name: product.name || product.sku || "Unknown item",
      unitsSold: 0,
      revenue: 0,
      profit: 0,
      lossCount: 0,
      totalLoss: 0,
      orderCount: 0,
    };

    existing.unitsSold += 1;
    existing.revenue += product.price;
    existing.orderCount += 1;

    if (product.hasCost) {
      existing.profit += product.profit;
      if (product.profit < 0) {
        existing.lossCount += 1;
        existing.totalLoss += Math.abs(product.profit);
      }
    }

    bySku.set(key, existing);
  }

  return Array.from(bySku.entries()).map(([key, stats]) => ({
    key,
    sku: stats.sku,
    name: stats.name,
    unitsSold: stats.unitsSold,
    revenue: roundMoney(stats.revenue),
    profit: roundMoney(stats.profit),
    lossCount: stats.lossCount,
    totalLoss: roundMoney(stats.totalLoss),
    orderCount: stats.orderCount,
  }));
}

export function buildTopSoldItems(
  products: EnrichedProduct[],
  limit = 10
): SkuRanking[] {
  return buildSkuAggregates(products)
    .sort((a, b) => {
      if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold;
      return b.revenue - a.revenue;
    })
    .slice(0, limit);
}

export function buildTopLossItems(
  products: EnrichedProduct[],
  limit = 10
): SkuRanking[] {
  return buildSkuAggregates(products)
    .filter((item) => item.lossCount > 0)
    .sort((a, b) => {
      // Prefer items with repeated losses, then total loss dollars
      if (b.lossCount !== a.lossCount) return b.lossCount - a.lossCount;
      return b.totalLoss - a.totalLoss;
    })
    .slice(0, limit);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
