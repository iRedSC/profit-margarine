export type ProductMarketplace =
    | "Amazon"
    | "Ebay"
    | "Shopify"
    | "TikTok";

export type SyncMarketplace = "amazon" | "ebay" | "shopify" | "tiktok";

const PRODUCT_TO_SYNC: Record<ProductMarketplace, SyncMarketplace> = {
    Amazon: "amazon",
    Ebay: "ebay",
    Shopify: "shopify",
    TikTok: "tiktok",
};

const SYNC_TO_PRODUCT: Record<SyncMarketplace, ProductMarketplace> = {
    amazon: "Amazon",
    ebay: "Ebay",
    shopify: "Shopify",
    tiktok: "TikTok",
};

export function toSyncMarketplace(
    marketplace: ProductMarketplace | SyncMarketplace | string
): SyncMarketplace {
    const lower = marketplace.toLowerCase();
    if (
        lower === "amazon" ||
        lower === "ebay" ||
        lower === "shopify" ||
        lower === "tiktok"
    ) {
        return lower;
    }
    throw new Error(`Unknown marketplace: ${marketplace}`);
}

export function toProductMarketplace(
    marketplace: ProductMarketplace | SyncMarketplace | string
): ProductMarketplace {
    const lower = marketplace.toLowerCase();
    if (lower === "amazon") return "Amazon";
    if (lower === "ebay") return "Ebay";
    if (lower === "shopify") return "Shopify";
    if (lower === "tiktok") return "TikTok";
    throw new Error(`Unknown marketplace: ${marketplace}`);
}

export function isProductMarketplace(
    value: string
): value is ProductMarketplace {
    return value in PRODUCT_TO_SYNC;
}

export { PRODUCT_TO_SYNC, SYNC_TO_PRODUCT };
