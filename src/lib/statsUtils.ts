import { calculateMargin, calculateProfit } from "./productUtils";
import { Product } from "../types/product";

export type ChartGranularity = "hour" | "day" | "week";

export type EnrichedProduct = Product & {
  netShipping: number;
  profit: number;
  margin: number;
  hasCost: boolean;
};

export type PeriodStats = {
  key: string;
  label: string;
  revenue: number;
  cost: number;
  fees: number;
  shipping: number;
  profit: number;
  margin: number;
  orderCount: number;
};

/** @deprecated Use PeriodStats */
export type DailyStats = PeriodStats;

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

/** Saturday start-of-week, matching dateRangeUtils */
function getWeekStart(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const daysToSubtract = day === 6 ? 0 : day + 1;
  start.setDate(start.getDate() - daysToSubtract);
  start.setHours(0, 0, 0, 0);
  return start;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toPeriodKey(timestamp: number, granularity: ChartGranularity): string {
  const date = new Date(timestamp);

  if (granularity === "week") {
    const weekStart = getWeekStart(date);
    return `${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(weekStart.getDate())}`;
  }

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());

  if (granularity === "hour") {
    return `${year}-${month}-${day}T${pad2(date.getHours())}`;
  }

  return `${year}-${month}-${day}`;
}

function parsePeriodKey(key: string, granularity: ChartGranularity): Date {
  if (granularity === "hour") {
    const [datePart, hourPart] = key.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day, Number(hourPart), 0, 0, 0);
  }

  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatPeriodLabel(key: string, granularity: ChartGranularity): string {
  const date = parsePeriodKey(key, granularity);

  if (granularity === "hour") {
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
    });
  }

  if (granularity === "week") {
    const weekEnd = new Date(date);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startLabel = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endLabel = weekEnd.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${startLabel}–${endLabel}`;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function advancePeriod(date: Date, granularity: ChartGranularity): void {
  if (granularity === "hour") {
    date.setHours(date.getHours() + 1);
  } else if (granularity === "week") {
    date.setDate(date.getDate() + 7);
  } else {
    date.setDate(date.getDate() + 1);
  }
}

function fillPeriodKeys(
  startKey: string,
  endKey: string,
  granularity: ChartGranularity
): string[] {
  const keys: string[] = [];
  const cursor = parsePeriodKey(startKey, granularity);
  const end = parsePeriodKey(endKey, granularity);

  while (cursor <= end) {
    keys.push(toPeriodKey(cursor.getTime(), granularity));
    advancePeriod(cursor, granularity);
  }

  return keys;
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
    return {
      ...product,
      netShipping,
      profit,
      margin,
      hasCost,
    };
  });
}

export function buildPeriodStats(
  products: EnrichedProduct[],
  granularity: ChartGranularity = "day"
): PeriodStats[] {
  const byPeriod = new Map<
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

    const key = toPeriodKey(product.orderDate, granularity);
    const existing = byPeriod.get(key) ?? {
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
    byPeriod.set(key, existing);
  }

  if (byPeriod.size === 0) {
    return [];
  }

  const sortedKeys = Array.from(byPeriod.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  const filledKeys = fillPeriodKeys(
    sortedKeys[0],
    sortedKeys[sortedKeys.length - 1],
    granularity
  );

  return filledKeys.map((key) => {
    const stats = byPeriod.get(key) ?? {
      revenue: 0,
      cost: 0,
      fees: 0,
      shipping: 0,
      profit: 0,
      orderCount: 0,
    };

    return {
      key,
      label: formatPeriodLabel(key, granularity),
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

/** @deprecated Use buildPeriodStats */
export function buildDailyStats(products: EnrichedProduct[]): PeriodStats[] {
  return buildPeriodStats(products, "day");
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

export function granularityLabel(granularity: ChartGranularity): string {
  switch (granularity) {
    case "hour":
      return "hour";
    case "week":
      return "week";
    case "day":
    default:
      return "day";
  }
}

export function granularityAdjective(granularity: ChartGranularity): string {
  switch (granularity) {
    case "hour":
      return "hourly";
    case "week":
      return "weekly";
    case "day":
    default:
      return "daily";
  }
}
