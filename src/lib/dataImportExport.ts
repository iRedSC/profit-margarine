export const DATA_EXPORT_COLUMNS = [
  "id",
  "sku",
  "name",
  "marketplace",
  "price",
  "cost",
  "fees",
  "shipping",
  "shippingPercentage",
  "buyerPaidShipping",
  "orderDate",
  "fulfillmentDate",
  "orderId",
  "OrderId",
  "fees_breakdown",
  "shipping_breakdown",
] as const;

export type DataExportColumn = (typeof DATA_EXPORT_COLUMNS)[number];

export type MarketplaceLiteral = "Ebay" | "Amazon" | "Shopify" | "TikTok";

export type ExportableProductRow = {
  _id: string;
  sku: string;
  name?: string;
  marketplace: string;
  price: number;
  cost?: number;
  fees: number;
  shipping: number;
  shippingPercentage?: number;
  buyerPaidShipping?: number;
  orderDate: number;
  fulfillmentDate?: number;
  orderId?: string;
  OrderId?: string;
  fees_breakdown?: Array<Array<string | number>>;
  shipping_breakdown?: Array<Array<string | number>>;
};

export type ParsedDataRow = {
  id?: string;
  sku: string;
  name?: string;
  marketplace: MarketplaceLiteral;
  price: number;
  cost?: number;
  fees: number;
  shipping: number;
  shippingPercentage?: number;
  buyerPaidShipping?: number;
  orderDate: number;
  fulfillmentDate?: number;
  orderId?: string;
  OrderId?: string;
  fees_breakdown?: Array<Array<string | number>>;
  shipping_breakdown?: Array<Array<string | number>>;
};

const MARKETPLACES = new Set(["Ebay", "Amazon", "Shopify", "TikTok"]);

function findHeader(
  headers: string[],
  ...candidates: string[]
): string | undefined {
  const normalized = headers.map((h) => ({
    raw: h,
    key: h.toLowerCase().replace(/[\s_]/g, ""),
  }));
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[\s_]/g, "");
    const match = normalized.find((h) => h.key === key);
    if (match) return match.raw;
  }
  for (const candidate of candidates) {
    const key = candidate.toLowerCase().replace(/[\s_]/g, "");
    const match = normalized.find((h) => h.key.includes(key));
    if (match) return match.raw;
  }
  return undefined;
}

function formatDate(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "";
  return new Date(value).toISOString();
}

function parseDate(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && !Number.isNaN(value)) {
    // Excel serial date (days since 1899-12-30)
    if (value > 20000 && value < 100000) {
      return Math.round((value - 25569) * 86400 * 1000);
    }
    return value;
  }
  const str = String(value).trim();
  if (!str) return undefined;
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return parsed;
  const asNumber = Number(str);
  if (!Number.isNaN(asNumber)) return asNumber;
  return undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isNaN(n) ? undefined : n;
}

function parseRequiredNumber(value: unknown, fallback = 0): number {
  const n = parseOptionalNumber(value);
  return n === undefined ? fallback : n;
}

function parseBreakdown(
  value: unknown
): Array<Array<string | number>> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) {
    return value as Array<Array<string | number>>;
  }
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) {
      return parsed as Array<Array<string | number>>;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeMarketplace(value: unknown): MarketplaceLiteral | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const matched = [...MARKETPLACES].find(
    (m) => m.toLowerCase() === raw.toLowerCase()
  );
  return matched ?? null;
}

export function productRowsToExportSheet(
  products: ExportableProductRow[]
): Record<string, string | number>[] {
  return products.map((p) => ({
    id: p._id,
    sku: p.sku,
    name: p.name || "",
    marketplace: p.marketplace,
    price: p.price,
    cost: p.cost ?? "",
    fees: p.fees,
    shipping: p.shipping,
    shippingPercentage: p.shippingPercentage ?? "",
    buyerPaidShipping: p.buyerPaidShipping ?? "",
    orderDate: formatDate(p.orderDate),
    fulfillmentDate: formatDate(p.fulfillmentDate),
    orderId: p.orderId || "",
    OrderId: p.OrderId || "",
    fees_breakdown: p.fees_breakdown ? JSON.stringify(p.fees_breakdown) : "",
    shipping_breakdown: p.shipping_breakdown
      ? JSON.stringify(p.shipping_breakdown)
      : "",
  }));
}

export function parseDataRowsFromSheet(
  jsonData: Record<string, unknown>[]
): ParsedDataRow[] {
  if (jsonData.length === 0) return [];

  const headers = Object.keys(jsonData[0] || {});
  const idHeader = findHeader(headers, "id", "_id");
  const skuHeader = findHeader(headers, "sku");
  const nameHeader = findHeader(headers, "name");
  const marketplaceHeader = findHeader(headers, "marketplace");
  const priceHeader = findHeader(headers, "price");
  const costHeader = findHeader(headers, "cost");
  const feesHeader = findHeader(headers, "fees");
  const shippingHeader = findHeader(headers, "shipping");
  const shippingPercentageHeader = findHeader(
    headers,
    "shippingPercentage",
    "shippingpercentage"
  );
  const buyerPaidShippingHeader = findHeader(
    headers,
    "buyerPaidShipping",
    "buyerpaidshipping"
  );
  const orderDateHeader = findHeader(headers, "orderDate", "orderdate");
  const fulfillmentDateHeader = findHeader(
    headers,
    "fulfillmentDate",
    "fulfillmentdate"
  );
  const orderIdHeader = findHeader(headers, "orderId", "orderid");
  const OrderIdHeader = headers.find((h) => h === "OrderId") ||
    findHeader(headers, "OrderId");
  const feesBreakdownHeader = findHeader(
    headers,
    "fees_breakdown",
    "feesbreakdown"
  );
  const shippingBreakdownHeader = findHeader(
    headers,
    "shipping_breakdown",
    "shippingbreakdown"
  );

  if (!skuHeader || !marketplaceHeader || !priceHeader || !orderDateHeader) {
    throw new Error(
      "Could not find required columns: sku, marketplace, price, orderDate"
    );
  }

  const rows: ParsedDataRow[] = [];

  for (const row of jsonData) {
    const sku = String(row[skuHeader] || "").trim();
    const marketplace = normalizeMarketplace(row[marketplaceHeader]);
    const orderDate = parseDate(row[orderDateHeader]);
    if (!sku || !marketplace || orderDate === undefined) continue;

    const parsed: ParsedDataRow = {
      sku,
      marketplace,
      price: parseRequiredNumber(row[priceHeader]),
      fees: parseRequiredNumber(feesHeader ? row[feesHeader] : 0),
      shipping: parseRequiredNumber(shippingHeader ? row[shippingHeader] : 0),
      orderDate,
    };

    if (idHeader) {
      const id = String(row[idHeader] || "").trim();
      if (id) parsed.id = id;
    }
    if (nameHeader) {
      const name = String(row[nameHeader] || "").trim();
      if (name) parsed.name = name;
    }
    const cost = costHeader ? parseOptionalNumber(row[costHeader]) : undefined;
    if (cost !== undefined) parsed.cost = cost;

    const shippingPercentage = shippingPercentageHeader
      ? parseOptionalNumber(row[shippingPercentageHeader])
      : undefined;
    if (shippingPercentage !== undefined) {
      parsed.shippingPercentage = shippingPercentage;
    }

    const buyerPaidShipping = buyerPaidShippingHeader
      ? parseOptionalNumber(row[buyerPaidShippingHeader])
      : undefined;
    if (buyerPaidShipping !== undefined) {
      parsed.buyerPaidShipping = buyerPaidShipping;
    }

    const fulfillmentDate = fulfillmentDateHeader
      ? parseDate(row[fulfillmentDateHeader])
      : undefined;
    if (fulfillmentDate !== undefined) parsed.fulfillmentDate = fulfillmentDate;

    if (orderIdHeader) {
      const orderId = String(row[orderIdHeader] || "").trim();
      if (orderId) parsed.orderId = orderId;
    }
    if (OrderIdHeader) {
      const OrderId = String(row[OrderIdHeader] || "").trim();
      if (OrderId) parsed.OrderId = OrderId;
    }

    if (feesBreakdownHeader) {
      const fees_breakdown = parseBreakdown(row[feesBreakdownHeader]);
      if (fees_breakdown) parsed.fees_breakdown = fees_breakdown;
    }
    if (shippingBreakdownHeader) {
      const shipping_breakdown = parseBreakdown(row[shippingBreakdownHeader]);
      if (shipping_breakdown) parsed.shipping_breakdown = shipping_breakdown;
    }

    rows.push(parsed);
  }

  return rows;
}

export const IMPORT_CHUNK_SIZE = 100;
