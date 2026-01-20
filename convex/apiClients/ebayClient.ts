"use node";

/**
 * eBay REST API Client
 * Centralizes eBay API interactions with error handling
 */
export class EbayClient {
    private baseUrl: string;

    constructor(
        private accessToken: string,
        private isSandbox: boolean = false
    ) {
        this.baseUrl = isSandbox
            ? "https://apiz.sandbox.ebay.com"
            : "https://apiz.ebay.com";
    }

    /**
     * Make authenticated request to eBay API
     */
    private async request(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<any> {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-Type": "application/json",
                ...options.headers,
            },
        });

        if (!response.ok) {
            throw new Error(
                `eBay API error: ${response.status} ${response.statusText}`
            );
        }

        return response.json();
    }

    /**
     * Get order by order ID
     */
    async getOrder(orderId: string): Promise<any> {
        const apiBaseUrl = this.isSandbox
            ? "https://api.sandbox.ebay.com"
            : "https://api.ebay.com";
        const url = `${apiBaseUrl}/sell/fulfillment/v1/order/${orderId}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(
                `Failed to fetch eBay order ${orderId}: ${response.status}`
            );
        }

        return response.json();
    }

    /**
     * Get shipping fulfillments for an order
     */
    async getShippingFulfillments(orderId: string): Promise<any> {
        const apiBaseUrl = this.isSandbox
            ? "https://api.sandbox.ebay.com"
            : "https://api.ebay.com";
        const url = `${apiBaseUrl}/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            return null; // Fulfillments may not exist for all orders
        }

        return response.json();
    }

    /**
     * Get transactions with date filter
     */
    async getTransactions(
        startDate: string,
        endDate?: string,
        limit: number = 200,
        offset: number = 0
    ): Promise<any> {
        const endpoint = "/sell/finances/v1/transaction";
        const url = new URL(`${this.baseUrl}${endpoint}`);
        url.searchParams.set("limit", limit.toString());
        url.searchParams.set("offset", offset.toString());

        const filter = endDate
            ? `transactionDate:[${startDate}..${endDate}]`
            : `transactionDate:[${startDate}..]`;
        url.searchParams.set("filter", filter);

        return this.request(url.pathname + url.search);
    }
}
