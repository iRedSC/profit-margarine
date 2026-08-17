"use node";

import AmazonSPAPI from "amazon-sp-api";

export type AmazonSpApiQuery = Record<string, unknown>;

export type AmazonSpApi = {
    callAPI: (params: {
        operation: string;
        endpoint?: string;
        path?: Record<string, string>;
        query?: AmazonSpApiQuery;
    }) => Promise<unknown>;
};

type AmazonOrderRef = {
    AmazonOrderId: string;
};

type SellingPartnerCtor = new (config: {
    region: string;
    refresh_token: string;
    credentials: {
        SELLING_PARTNER_APP_CLIENT_ID: string;
        SELLING_PARTNER_APP_CLIENT_SECRET: string;
    };
}) => AmazonSpApi;

const SellingPartnerAPI =
    (AmazonSPAPI as unknown as { default?: SellingPartnerCtor }).default ||
    (AmazonSPAPI as unknown as SellingPartnerCtor);

export function asSpApiRecord(
    value: unknown
): Record<string, unknown> | undefined {
    if (typeof value === "object" && value !== null) {
        return value as Record<string, unknown>;
    }
    return undefined;
}

export const AMAZON_BACKFILL_LOOKBACK_MS = 72 * 60 * 60 * 1000;
export const AMAZON_PENDING_BACKFILL_RETRY_MS = 60 * 60 * 1000;

// Add your Amazon SP-API credentials as environment variables:
// - AMAZON_CLIENT_ID (LWA Client ID)
// - AMAZON_CLIENT_SECRET (LWA Client Secret)
// - AMAZON_REFRESH_TOKEN (Refresh Token)
// - AMAZON_REGION (must be "na", "eu", or "fe")

export function getSellingPartnerAPI(): AmazonSpApi {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;
    const refreshToken = process.env.AMAZON_REFRESH_TOKEN;
    const regionEnv = process.env.AMAZON_REGION;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(
            "Amazon API credentials not configured. Please set AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN, and AMAZON_REGION environment variables."
        );
    }

    // Validate region
    const validRegions = ["na", "eu", "fe"];
    const region =
        regionEnv && validRegions.includes(regionEnv) ? regionEnv : null;

    if (!region) {
        throw new Error(
            `Invalid AMAZON_REGION. Please set it to one of: "na" (North America), "eu" (Europe), or "fe" (Far East). Current value: ${regionEnv || "not set"}`
        );
    }

    return new SellingPartnerAPI({
        region: region,
        refresh_token: refreshToken,
        credentials: {
            SELLING_PARTNER_APP_CLIENT_ID: clientId,
            SELLING_PARTNER_APP_CLIENT_SECRET: clientSecret,
        },
    });
}

export async function fetchAmazonOrders(
    spApi: AmazonSpApi,
    query: AmazonSpApiQuery
): Promise<AmazonOrderRef[]> {
    const orders: AmazonOrderRef[] = [];
    let nextToken: unknown;

    do {
        const ordersResponse = asSpApiRecord(
            await spApi.callAPI({
                operation: "getOrders",
                endpoint: "orders",
                query: nextToken
                    ? { NextToken: nextToken }
                    : {
                          ...query,
                          MaxResultsPerPage: 100,
                      },
            })
        );

        orders.push(...((ordersResponse?.Orders || []) as AmazonOrderRef[]));
        nextToken = ordersResponse?.NextToken || ordersResponse?.nextToken;
    } while (nextToken);

    return orders;
}
