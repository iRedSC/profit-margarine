"use node";

import AmazonSPAPI from "amazon-sp-api";

const SellingPartnerAPI = (AmazonSPAPI as any).default || AmazonSPAPI;

export const AMAZON_BACKFILL_LOOKBACK_MS = 72 * 60 * 60 * 1000;
export const AMAZON_PENDING_BACKFILL_RETRY_MS = 60 * 60 * 1000;

// Add your Amazon SP-API credentials as environment variables:
// - AMAZON_CLIENT_ID (LWA Client ID)
// - AMAZON_CLIENT_SECRET (LWA Client Secret)
// - AMAZON_REFRESH_TOKEN (Refresh Token)
// - AMAZON_REGION (must be "na", "eu", or "fe")

export function getSellingPartnerAPI() {
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
    spApi: any,
    query: Record<string, any>
): Promise<Array<{ AmazonOrderId: string }>> {
    const orders: Array<{ AmazonOrderId: string }> = [];
    let nextToken: string | undefined;

    do {
        const ordersResponse = await spApi.callAPI({
            operation: "getOrders",
            endpoint: "orders",
            query: nextToken
                ? { NextToken: nextToken }
                : {
                      ...query,
                      MaxResultsPerPage: 100,
                  },
        });

        orders.push(...(ordersResponse.Orders || []));
        nextToken = ordersResponse.NextToken || ordersResponse.nextToken;
    } while (nextToken);

    return orders;
}
