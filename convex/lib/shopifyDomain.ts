// Shopify's documented shape for a shop's permanent domain. Anything else is
// rejected before we build a URL from it, because the token exchange posts
// our client secret to whatever host this names.
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** The lower-cased shop domain, or null if it isn't a *.myshopify.com host. */
export function parseShopDomain(shop: string): string | null {
    const normalized = shop.trim().toLowerCase();
    return SHOP_DOMAIN_PATTERN.test(normalized) ? normalized : null;
}

export function requireShopDomain(shop: string): string {
    const domain = parseShopDomain(shop);
    if (!domain) {
        throw new Error("Invalid Shopify shop domain");
    }
    return domain;
}
