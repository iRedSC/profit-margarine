"use node";

import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
    validateSyncActive,
    updateSyncProgress,
    handleSyncError,
    processWithProgress,
    generateMonthlyBatches,
} from "./marketplaceUtils";
import { finishSync } from "./marketplaceSync";
import { SyncMessages } from "./syncMessages";

export type MarketplaceType = "amazon" | "ebay" | "shopify";

/**
 * Base configuration for marketplace sync operations
 */
export interface SyncConfig {
    userId: Id<"users">;
    syncId: Id<"syncs">;
    updateExisting?: boolean;
}

/**
 * Base sync handler with common sync patterns
 * Provides template for marketplace-specific sync implementations
 */
export abstract class BaseSyncHandler {
    protected ctx: any;
    protected config: SyncConfig;
    protected marketplace: MarketplaceType;

    constructor(ctx: any, config: SyncConfig, marketplace: MarketplaceType) {
        this.ctx = ctx;
        this.config = config;
        this.marketplace = marketplace;
    }

    /**
     * Main sync execution flow
     */
    async execute(): Promise<{ success: boolean; ordersProcessed: number }> {
        try {
            // Validate sync exists and is active before starting
            await validateSyncActive(this.ctx, this.config.syncId);

            // Get marketplace connection
            const connection = await this.getConnection();
            if (!connection) {
                throw new Error(
                    `No ${this.marketplace} connection found. Please connect your ${this.marketplace} account first.`
                );
            }

            // Update progress - fetching orders
            await updateSyncProgress(
                this.ctx,
                this.config.syncId,
                SyncMessages.fetching(this.marketplace),
                undefined
            );

            // Fetch order IDs (marketplace-specific)
            const orderIds = await this.fetchOrderIds(connection);

            // Process orders with progress tracking
            let processedCount = 0;
            await processWithProgress(
                this.ctx,
                this.config.syncId,
                orderIds,
                async (orderId: string, index: number) => {
                    try {
                        await this.processOrder(orderId, connection);
                        processedCount++;
                    } catch (error) {
                        console.error(
                            `Error processing ${this.marketplace} order ${orderId}:`,
                            error
                        );
                        // Continue processing other orders
                    }
                },
                this.marketplace
            );

            // Validate sync exists and is active before finishing
            await validateSyncActive(this.ctx, this.config.syncId);

            await finishSync(this.ctx, this.config.syncId, this.marketplace);

            return { success: true, ordersProcessed: processedCount };
        } catch (error: any) {
            // Don't treat cancellation or missing sync as an error
            if (
                error.message === "Sync was canceled" ||
                error.message === "Sync does not exist" ||
                error.message?.includes("Sync is not active")
            ) {
                return { success: false, canceled: true, ordersProcessed: 0 };
            }

            // Only handle error if sync still exists
            const syncExists = await this.ctx.runQuery(
                internal.products.getSyncById,
                { syncId: this.config.syncId }
            );
            if (syncExists) {
                await handleSyncError(
                    this.ctx,
                    this.config.syncId,
                    error,
                    this.marketplace
                );
            }
            throw error;
        }
    }

    /**
     * Get marketplace connection (must be implemented by subclasses)
     */
    protected abstract getConnection(): Promise<any>;

    /**
     * Fetch order IDs for processing (must be implemented by subclasses)
     */
    protected abstract fetchOrderIds(connection: any): Promise<string[]>;

    /**
     * Process a single order (must be implemented by subclasses)
     */
    protected abstract processOrder(
        orderId: string,
        connection: any
    ): Promise<void>;
}

// Note: generateMonthlyBatches is imported from marketplaceUtils.ts to avoid duplication
