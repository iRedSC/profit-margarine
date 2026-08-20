"use node";

import type { ShopifyBasicEvent } from "./shippingLabelEvents";

export type ShopifyMoney = {
    amount?: string;
};

export type ShopifyLineItem = {
    id: string;
    title?: string;
    sku?: string | null;
    quantity: number;
    originalUnitPriceSet?: {
        shopMoney?: ShopifyMoney;
    };
};

export type ShopifyFulfillment = {
    createdAt?: string;
    status?: string;
};

export type ShopifyOrder = {
    name?: string;
    createdAt: string;
    cancelledAt?: string | null;
    channelInformation?: {
        channelDefinition?: {
            channelName?: string;
        } | null;
    } | null;
    events?: {
        edges: Array<{
            node: ShopifyBasicEvent;
        }>;
    };
    fulfillments?: ShopifyFulfillment[];
    lineItems: {
        edges: Array<{
            node: ShopifyLineItem;
        }>;
    };
};

export type ShopifyGraphQLData = {
    order?: ShopifyOrder | null;
};

export type ShopifyGraphQLVariables = Record<string, unknown>;

type ShopifyGraphQLResponse<TData> = {
    errors?: unknown;
    data: TData;
};

/**
 * Execute a GraphQL query against Shopify API
 */
export async function fetchShopifyGraphQL<TData = ShopifyGraphQLData>(
    query: string,
    variables: ShopifyGraphQLVariables,
    shop: string,
    accessToken: string
): Promise<TData> {
    const endpoint = `https://${shop}/admin/api/2026-01/graphql.json`;

    const res = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Shopify GraphQL error: ${res.status} ${text}`);
    }

    const json = (await res.json()) as ShopifyGraphQLResponse<TData>;

    if (json.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    if (json.data == null) {
        throw new Error("Shopify GraphQL returned no data");
    }

    return json.data;
}
