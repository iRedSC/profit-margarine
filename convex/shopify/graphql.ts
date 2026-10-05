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

export type ShopifyFulfillmentOrder = {
    deliveryMethod?: {
        methodType?: string;
    } | null;
};

export type ShopifyShippingLine = {
    title?: string;
    code?: string | null;
    deliveryCategory?: string | null;
    shippingRateHandle?: string | null;
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
    fulfillmentOrders?: {
        nodes?: ShopifyFulfillmentOrder[];
        edges?: Array<{
            node?: ShopifyFulfillmentOrder;
        }>;
    };
    shippingLines?: {
        nodes?: ShopifyShippingLine[];
        edges?: Array<{
            node?: ShopifyShippingLine;
        }>;
    };
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

type ShopifyGraphQLError = {
    message?: string;
    path?: Array<string | number>;
    extensions?: { code?: string };
};

type ShopifyGraphQLResponse<TData> = {
    errors?: ShopifyGraphQLError[];
    data?: TData | null;
};

/** Any one of these lets an app read order.fulfillmentOrders (filtered by type). */
export const FULFILLMENT_ORDER_SCOPES = [
    "read_merchant_managed_fulfillment_orders",
    "write_merchant_managed_fulfillment_orders",
    "read_assigned_fulfillment_orders",
    "write_assigned_fulfillment_orders",
    "read_third_party_fulfillment_orders",
    "write_third_party_fulfillment_orders",
];

export function hasFulfillmentOrderScope(scopes: string[]): boolean {
    return scopes.some((scope) => FULFILLMENT_ORDER_SCOPES.includes(scope));
}

const MAX_THROTTLE_RETRIES = 4;

function formatGraphQLErrors(errors: ShopifyGraphQLError[]): string {
    return errors
        .map((error) => {
            const code = error.extensions?.code;
            const path = error.path?.join(".");
            const detail = [code, path && `at ${path}`].filter(Boolean).join(" ");
            return `${error.message ?? "Unknown error"}${detail ? ` [${detail}]` : ""}`;
        })
        .join("; ");
}

function isThrottled(errors: ShopifyGraphQLError[] | undefined): boolean {
    return Boolean(
        errors?.length &&
            errors.every((error) => error.extensions?.code === "THROTTLED")
    );
}

/**
 * Execute a GraphQL query against Shopify API.
 *
 * With `allowPartial`, field-level errors are tolerated only when the
 * top-level field still came back. If an error nulled a root field (e.g. an
 * ACCESS_DENIED on a non-null child nulls `order`), we throw Shopify's actual
 * error instead of letting callers misreport it as "not found".
 */
export async function fetchShopifyGraphQL<TData = ShopifyGraphQLData>(
    query: string,
    variables: ShopifyGraphQLVariables,
    shop: string,
    accessToken: string,
    options?: { allowPartial?: boolean }
): Promise<TData> {
    const endpoint = `https://${shop}/admin/api/2026-01/graphql.json`;

    for (let attempt = 1; ; attempt++) {
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
            if (res.status === 429 && attempt < MAX_THROTTLE_RETRIES) {
                await new Promise((r) => setTimeout(r, 2000 * attempt));
                continue;
            }
            throw new Error(
                `Shopify GraphQL HTTP ${res.status}: ${text.slice(0, 500)}`
            );
        }

        const json = (await res.json()) as ShopifyGraphQLResponse<TData>;
        const errors = json.errors;

        if (isThrottled(errors) && attempt < MAX_THROTTLE_RETRIES) {
            await new Promise((r) => setTimeout(r, 2000 * attempt));
            continue;
        }

        if (json.data == null) {
            throw new Error(
                errors?.length
                    ? `Shopify GraphQL: ${formatGraphQLErrors(errors)}`
                    : "Shopify GraphQL returned no data"
            );
        }

        if (errors?.length) {
            const data = json.data as Record<string, unknown>;
            const nulledRoot = errors.some((error) => {
                const root = error.path?.[0];
                return typeof root === "string" && data[root] == null;
            });
            if (!options?.allowPartial || nulledRoot) {
                throw new Error(
                    `Shopify GraphQL: ${formatGraphQLErrors(errors)}`
                );
            }
            console.error(
                JSON.stringify({
                    operation: "shopify_graphql_partial",
                    errors: formatGraphQLErrors(errors),
                })
            );
        }

        return json.data;
    }
}

export async function fetchShopifyAccessScopes(
    shop: string,
    accessToken: string
): Promise<string[]> {
    const data = await fetchShopifyGraphQL<{
        currentAppInstallation: { accessScopes: Array<{ handle: string }> };
    }>(
        "{ currentAppInstallation { accessScopes { handle } } }",
        {},
        shop,
        accessToken
    );
    return data.currentAppInstallation.accessScopes.map((s) => s.handle);
}
