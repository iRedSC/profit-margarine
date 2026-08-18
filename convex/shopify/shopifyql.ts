"use node";

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { fetchShopifyGraphQL } from "./graphql";

const SHOPIFYQL_PAGE_SIZE = 1_000;

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
            rows?: ShopifyQlRow[];
        } | null;
        parseErrors: string[];
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

function dateClause(startDate?: string, endDate?: string): string {
    if (!startDate && !endDate) return "";
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
    schema: "profitability" | "fees";
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
        `LIMIT ${SHOPIFYQL_PAGE_SIZE} OFFSET ${args.offset ?? 0}`,
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
    feeRows: ShopifyQlRow[]
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
    if (result.parseErrors.length > 0) {
        throw new Error(`ShopifyQL parse error: ${result.parseErrors.join("; ")}`);
    }
    return result.tableData?.rows ?? [];
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

export async function fetchShopifyOrderFinancials(args: {
    shop: string;
    accessToken: string;
    startDate?: string;
    endDate?: string;
    orderIds?: string[];
}): Promise<ShopifyOrderFinancials[]> {
    const queryArgs = {
        startDate: args.startDate,
        endDate: args.endDate,
        orderIds: args.orderIds,
    };
    const [profitabilityRows, feeRows] = await Promise.all([
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
    ]);
    return mergeShopifyFinancialRows(profitabilityRows, feeRows);
}

export const getShopifyOrderFinancials = internalAction({
    args: {
        shop: v.string(),
        accessToken: v.string(),
        orderIds: v.array(v.string()),
    },
    handler: async (_ctx, args) =>
        fetchShopifyOrderFinancials({
            shop: args.shop,
            accessToken: args.accessToken,
            orderIds: args.orderIds,
        }),
});
