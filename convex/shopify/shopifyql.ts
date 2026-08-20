"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { fetchShopifyGraphQL } from "./graphql";

const SHOPIFYQL_PAGE_SIZE = 50;
const SHOPIFYQL_DEFAULT_SINCE = "2006-01-01";
const SHOPIFYQL_DAY_MS = 24 * 60 * 60 * 1000;
const SHOPIFYQL_TZ_PAD_DAYS = 2;

export function shopifyQlDateWindow(
    orderTimestamp: number,
    now = Date.now()
): { startDate: string; endDate: string } {
    const start = new Date(orderTimestamp - SHOPIFYQL_TZ_PAD_DAYS * SHOPIFYQL_DAY_MS);
    const end = new Date(
        Math.max(now, orderTimestamp) + SHOPIFYQL_TZ_PAD_DAYS * SHOPIFYQL_DAY_MS
    );
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    };
}

export const shopifyOrderFinancialsValidator = v.object({
    orderId: v.string(),
    storeShippingCost: v.number(),
    shippingLabelAdjustment: v.number(),
    customerShippingCharges: v.number(),
    shopifyPaymentsProcessingFees: v.number(),
    foreignExchangeFees: v.number(),
    managedMarketsFees: v.number(),
    internationalFees: v.number(),
});

export type ShopifyOrderFinancials = {
    orderId: string;
    storeShippingCost: number;
    shippingLabelAdjustment: number;
    customerShippingCharges: number;
    shopifyPaymentsProcessingFees: number;
    foreignExchangeFees: number;
    managedMarketsFees: number;
    internationalFees: number;
};

type ShopifyQlRow = Record<string, string | number | null>;

type ShopifyQlResponse = {
    shopifyqlQuery?: {
        tableData?: {
            rows?: unknown;
        } | null;
        parseErrors?: string[] | null;
    } | null;
};

function numericOrderIds(orderIds: string[]): string[] {
    return [...new Set(orderIds.map((id) => id.split("/").pop() ?? ""))].map(
        (id) => {
            if (!/^\d+$/.test(id)) {
                throw new Error(`Invalid Shopify order ID: ${id}`);
            }
            return id;
        }
    );
}

function queryLimit(orderIds?: string[]): number {
    if (!orderIds || orderIds.length === 0) return SHOPIFYQL_PAGE_SIZE;
    return Math.min(SHOPIFYQL_PAGE_SIZE, numericOrderIds(orderIds).length);
}

function limitClause(orderIds?: string[], offset?: number): string {
    const limit = queryLimit(orderIds);
    if (!offset) return `LIMIT ${limit}`;
    return `LIMIT ${limit} OFFSET ${offset}`;
}

function dateClause(startDate?: string, endDate?: string): string {
    if (!startDate && !endDate) {
        return `SINCE ${SHOPIFYQL_DEFAULT_SINCE} UNTIL today`;
    }
    if (!startDate || !endDate) {
        throw new Error("ShopifyQL date ranges require both a start and end date");
    }
    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
        throw new Error("ShopifyQL dates must use YYYY-MM-DD");
    }
    return `SINCE ${startDate} UNTIL ${endDate}`;
}

function orderClause(orderIds?: string[]): string {
    if (!orderIds || orderIds.length === 0) return "";
    return `WHERE order_id IN (${numericOrderIds(orderIds).join(", ")})`;
}

function buildQuery(args: {
    schema: "profitability" | "fees" | "shipping_labels";
    metrics: string[];
    startDate?: string;
    endDate?: string;
    orderIds?: string[];
    offset?: number;
}): string {
    return [
        `FROM ${args.schema}`,
        `SHOW ${args.metrics.join(", ")}`,
        orderClause(args.orderIds),
        "GROUP BY order_id",
        dateClause(args.startDate, args.endDate),
        "ORDER BY order_id ASC",
        limitClause(args.orderIds, args.offset),
    ]
        .filter(Boolean)
        .join("\n");
}

export function buildShopifyProfitabilityQuery(args: {
    startDate?: string;
    endDate?: string;
    orderIds?: string[];
    offset?: number;
}): string {
    return buildQuery({
        schema: "profitability",
        metrics: [
            "average_store_shipping_costs",
            "average_shipping_label_adjustment_costs",
            "average_customer_shipping_charges",
        ],
        ...args,
    });
}

export function buildShopifyFeesQuery(args: {
    startDate?: string;
    endDate?: string;
    orderIds?: string[];
    offset?: number;
}): string {
    return buildQuery({
        schema: "fees",
        metrics: [
            "shopify_payments_processing_fees",
            "foreign_exchange_fees",
            "managed_markets_fees",
            "international_fees",
        ],
        ...args,
    });
}

export function buildShopifyShippingLabelsQuery(args: {
    startDate?: string;
    endDate?: string;
    orderIds?: string[];
    offset?: number;
}): string {
    return buildQuery({
        schema: "shipping_labels",
        metrics: ["shipping_label_costs"],
        ...args,
    });
}

function money(row: ShopifyQlRow, key: string): number {
    const value = Number(row[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
}

function orderId(row: ShopifyQlRow): string {
    const rawValue = String(row.order_id ?? "");
    const value = rawValue.split("/").pop() ?? "";
    if (!/^\d+$/.test(value)) {
        throw new Error(`Invalid order_id in ShopifyQL response: ${rawValue}`);
    }
    return value;
}

export function mergeShopifyFinancialRows(
    profitabilityRows: ShopifyQlRow[],
    feeRows: ShopifyQlRow[],
    shippingLabelRows: ShopifyQlRow[] = []
): ShopifyOrderFinancials[] {
    const byOrder = new Map<string, ShopifyOrderFinancials>();

    const get = (id: string): ShopifyOrderFinancials => {
        const existing = byOrder.get(id);
        if (existing) return existing;
        const financials: ShopifyOrderFinancials = {
            orderId: id,
            storeShippingCost: 0,
            shippingLabelAdjustment: 0,
            customerShippingCharges: 0,
            shopifyPaymentsProcessingFees: 0,
            foreignExchangeFees: 0,
            managedMarketsFees: 0,
            internationalFees: 0,
        };
        byOrder.set(id, financials);
        return financials;
    };

    for (const row of profitabilityRows) {
        const financials = get(orderId(row));
        financials.storeShippingCost = money(
            row,
            "average_store_shipping_costs"
        );
        financials.shippingLabelAdjustment = money(
            row,
            "average_shipping_label_adjustment_costs"
        );
        financials.customerShippingCharges = money(
            row,
            "average_customer_shipping_charges"
        );
    }

    for (const row of feeRows) {
        const financials = get(orderId(row));
        financials.shopifyPaymentsProcessingFees = money(
            row,
            "shopify_payments_processing_fees"
        );
        financials.foreignExchangeFees = money(row, "foreign_exchange_fees");
        financials.managedMarketsFees = money(row, "managed_markets_fees");
        financials.internationalFees = money(row, "international_fees");
    }

    for (const row of shippingLabelRows) {
        const financials = get(orderId(row));
        const labelCost = money(row, "shipping_label_costs");
        if (labelCost !== 0) {
            financials.storeShippingCost =
                labelCost + financials.shippingLabelAdjustment;
        }
    }

    return [...byOrder.values()];
}

async function runShopifyQl(
    shop: string,
    accessToken: string,
    shopifyQl: string
): Promise<ShopifyQlRow[]> {
    const query = `
        query RunShopifyQl($query: String!) {
          shopifyqlQuery(query: $query) {
            tableData { rows }
            parseErrors
          }
        }
    `;
    const data = await fetchShopifyGraphQL<ShopifyQlResponse>(
        query,
        { query: shopifyQl },
        shop,
        accessToken
    );
    const result = data.shopifyqlQuery;
    if (!result) throw new Error("ShopifyQL returned no result");
    if ((result.parseErrors ?? []).length > 0) {
        throw new Error(
            `ShopifyQL parse error: ${(result.parseErrors ?? []).join("; ")}`
        );
    }
    const rows = result.tableData?.rows;
    if (!Array.isArray(rows)) return [];
    return rows.filter(
        (row): row is ShopifyQlRow =>
            row !== null && typeof row === "object" && !Array.isArray(row)
    );
}

async function runPagedShopifyQl(
    shop: string,
    accessToken: string,
    buildQuery: (offset: number) => string
): Promise<ShopifyQlRow[]> {
    const rows: ShopifyQlRow[] = [];
    for (let offset = 0; ; offset += SHOPIFYQL_PAGE_SIZE) {
        const page = await runShopifyQl(
            shop,
            accessToken,
            buildQuery(offset)
        );
        rows.push(...page);
        if (page.length < SHOPIFYQL_PAGE_SIZE) return rows;
    }
}

async function fetchOrderCreatedAt(
    shop: string,
    accessToken: string,
    orderId: string
): Promise<number | undefined> {
    const gid = orderId.startsWith("gid://")
        ? orderId
        : `gid://shopify/Order/${orderId}`;
    const data = await fetchShopifyGraphQL<{
        order?: { createdAt?: string } | null;
    }>(
        `query GetOrderCreatedAt($id: ID!) { order(id: $id) { createdAt } }`,
        { id: gid },
        shop,
        accessToken
    );
    const timestamp = Date.parse(data.order?.createdAt ?? "");
    return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function resolveShopifyQlDates(args: {
    shop: string;
    accessToken: string;
    startDate?: string;
    endDate?: string;
    orderDate?: number;
    orderIds?: string[];
}): Promise<{ startDate?: string; endDate?: string }> {
    if (args.startDate && args.endDate) {
        return { startDate: args.startDate, endDate: args.endDate };
    }
    if (args.orderDate != null) {
        return shopifyQlDateWindow(args.orderDate);
    }
    const timestamps: number[] = [];
    for (const orderId of args.orderIds ?? []) {
        const timestamp = await fetchOrderCreatedAt(
            args.shop,
            args.accessToken,
            orderId
        );
        if (timestamp != null) timestamps.push(timestamp);
    }
    if (timestamps.length === 0) return {};
    return shopifyQlDateWindow(Math.min(...timestamps));
}

export async function fetchShopifyOrderFinancials(args: {
    shop: string;
    accessToken: string;
    startDate?: string;
    endDate?: string;
    orderDate?: number;
    orderIds?: string[];
}): Promise<ShopifyOrderFinancials[]> {
    const { startDate, endDate } = await resolveShopifyQlDates(args);
    const queryArgs = {
        startDate,
        endDate,
        orderIds: args.orderIds,
    };
    const [profitabilityRows, feeRows, shippingLabelRows] = await Promise.all([
        runPagedShopifyQl(
            args.shop,
            args.accessToken,
            (offset) => buildShopifyProfitabilityQuery({ ...queryArgs, offset })
        ),
        runPagedShopifyQl(
            args.shop,
            args.accessToken,
            (offset) => buildShopifyFeesQuery({ ...queryArgs, offset })
        ),
        runPagedShopifyQl(
            args.shop,
            args.accessToken,
            (offset) =>
                buildShopifyShippingLabelsQuery({ ...queryArgs, offset })
        ),
    ]);
    return mergeShopifyFinancialRows(
        profitabilityRows,
        feeRows,
        shippingLabelRows
    );
}

export const getShopifyOrderFinancials = internalAction({
    args: {
        shop: v.string(),
        accessToken: v.string(),
        orderIds: v.array(v.string()),
        orderDate: v.optional(v.number()),
    },
    handler: async (_ctx, args) =>
        fetchShopifyOrderFinancials({
            shop: args.shop,
            accessToken: args.accessToken,
            orderIds: args.orderIds,
            orderDate: args.orderDate,
        }),
});
