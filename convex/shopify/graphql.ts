"use node";

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

export type ShopifyEvent = {
    createdAt: string;
    message?: string;
    subject?: {
        id?: string;
    } | null;
};

export type ShopifyEventsConnection = {
    pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
    };
    edges: Array<{
        node: ShopifyEvent;
    }>;
};

export type ShopifyOrder = {
    name?: string;
    createdAt: string;
    cancelledAt?: string | null;
    shippingLine?: {
        discountedPriceSet?: {
            shopMoney?: ShopifyMoney;
        };
    } | null;
    channelInformation?: {
        channelDefinition?: {
            channelName?: string;
        } | null;
    } | null;
    fulfillments?: ShopifyFulfillment[];
    lineItems: {
        edges: Array<{
            node: ShopifyLineItem;
        }>;
    };
    events?: {
        edges?: Array<{
            node: ShopifyEvent;
        }>;
    };
};

export type ShopifyGraphQLData = {
    order?: ShopifyOrder | null;
    events: ShopifyEventsConnection;
};

export type ShopifyGraphQLVariables = Record<string, unknown>;

type ShopifyGraphQLResponse<TData> = {
    errors?: unknown;
    data: TData;
};

/**
 * Execute a GraphQL query against Shopify API
 */
export async function fetchShopifyGraphQL(
    query: string,
    variables: ShopifyGraphQLVariables,
    shop: string,
    accessToken: string
): Promise<ShopifyGraphQLData> {
    const endpoint = `https://${shop}/admin/api/2024-10/graphql.json`;

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

    const json = (await res.json()) as ShopifyGraphQLResponse<ShopifyGraphQLData>;

    if (json.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
}
