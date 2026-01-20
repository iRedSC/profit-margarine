"use node";

/**
 * Shopify GraphQL API Client
 * Centralizes Shopify API interactions with error handling and retry logic
 */
export class ShopifyClient {
    constructor(
        private shop: string,
        private accessToken: string,
        private apiVersion: string = "2024-10"
    ) {}

    /**
     * Execute a GraphQL query against Shopify API
     */
    async query(query: string, variables: any = {}): Promise<any> {
        const endpoint = `https://${this.shop}/admin/api/${this.apiVersion}/graphql.json`;

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": this.accessToken,
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Shopify GraphQL error: ${response.status} ${text}`);
        }

        const json = await response.json();

        if (json.errors) {
            throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
        }

        return json.data;
    }

    /**
     * Get order by GID
     */
    async getOrder(orderGid: string): Promise<any> {
        const query = `
            query GetOrder($id: ID!) {
                order(id: $id) {
                    id
                    name
                    createdAt
                    cancelledAt
                    shippingLine {
                        discountedPriceSet {
                            shopMoney {
                                amount
                            }
                        }
                    }
                    channelInformation {
                        channelDefinition {
                            channelName
                        }
                    }
                    fulfillments(first: 10) {
                        id
                        createdAt
                        status
                        trackingInfo {
                            number
                            company
                        }
                    }
                    lineItems(first: 100) {
                        edges {
                            node {
                                id
                                title
                                sku
                                quantity
                                originalUnitPriceSet {
                                    shopMoney {
                                        amount
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        return this.query(query, { id: orderGid });
    }

    /**
     * Get order events
     */
    async getOrderEvents(orderGid: string, first: number = 250): Promise<any> {
        const query = `
            query OrderEvents($orderId: ID!, $first: Int!) {
                order(id: $orderId) {
                    id
                    events(first: $first, sortKey: CREATED_AT, reverse: false) {
                        edges {
                            node {
                                id
                                createdAt
                                message
                                ... on BasicEvent {
                                    action
                                }
                            }
                        }
                    }
                }
            }
        `;

        return this.query(query, { orderId: orderGid, first });
    }

    /**
     * Get events with query filter
     */
    async getEvents(
        queryString: string,
        first: number = 100,
        after?: string
    ): Promise<any> {
        const query = `
            query OrderEvents($first: Int!, $after: String, $query: String!) {
                events(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
                    pageInfo {
                        hasNextPage
                        endCursor
                    }
                    edges {
                        node {
                            id
                            createdAt
                            message
                            ... on BasicEvent {
                                action
                                subjectType
                                subject {
                                    ... on Order {
                                        id
                                        name
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `;

        return this.query(query, { first, after, query: queryString });
    }
}
