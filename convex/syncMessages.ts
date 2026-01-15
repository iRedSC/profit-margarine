import { MarketplaceType } from "./marketplaceConnections";

/**
 * Centralized sync message templates for consistency across the application
 */
export class SyncMessages {
  /**
   * Get marketplace display name (capitalized)
   */
  private static getMarketplaceName(marketplace: MarketplaceType): string {
    return marketplace.charAt(0).toUpperCase() + marketplace.slice(1);
  }

  /**
   * Starting a new sync
   */
  static starting(marketplace: MarketplaceType): string {
    return `Starting ${this.getMarketplaceName(marketplace)} sync...`;
  }

  /**
   * Starting a 1-year sync
   */
  static startingOneYear(marketplace: MarketplaceType): string {
    return `Starting ${this.getMarketplaceName(marketplace)} 1-year sync...`;
  }

  /**
   * Fetching orders/transactions/events
   */
  static fetching(marketplace: MarketplaceType): string {
    const names: Record<MarketplaceType, string> = {
      amazon: "Fetching Amazon orders...",
      ebay: "Fetching eBay transactions...",
      shopify: "Fetching shipping label events...",
      tiktok: "Fetching TikTok orders...",
    };
    return names[marketplace];
  }

  /**
   * Fetching with batch progress
   */
  static fetchingBatch(
    marketplace: MarketplaceType,
    current: number,
    total: number
  ): string {
    const baseMessages: Record<MarketplaceType, string> = {
      amazon: "Fetching Amazon orders",
      ebay: "Fetching eBay transactions",
      shopify: "Fetching Shopify events",
      tiktok: "Fetching TikTok orders",
    };
    return `${baseMessages[marketplace]} (batch ${current}/${total})...`;
  }

  /**
   * Processing orders/items
   */
  static processing(marketplace: MarketplaceType): string {
    return `Processing ${this.getMarketplaceName(marketplace)} orders...`;
  }

  /**
   * Sync completed successfully
   */
  static complete(marketplace?: MarketplaceType): string {
    if (marketplace) {
      return `${this.getMarketplaceName(marketplace)} sync complete`;
    }
    return "Sync complete";
  }

  /**
   * Sync was canceled
   */
  static canceled(reason?: string): string {
    if (reason) {
      return `Sync canceled: ${reason}`;
    }
    return "Sync canceled";
  }

  /**
   * Sync was canceled because a new one started
   */
  static canceledForNewSync(): string {
    return "Sync canceled (new sync started)";
  }

  /**
   * Sync failed with error
   */
  static failed(marketplace: MarketplaceType, error: string): string {
    return `${this.getMarketplaceName(marketplace)} sync failed: ${error}`;
  }
}
