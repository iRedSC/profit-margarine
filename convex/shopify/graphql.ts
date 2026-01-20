"use node";

/**
 * Execute a GraphQL query against Shopify API
 */
export async function fetchShopifyGraphQL(
    query: string,
    variables: any,
    shop: string,
    accessToken: string
) {
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

    const json = await res.json();

    if (json.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    return json.data;
}
