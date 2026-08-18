const US_API_HOSTS = new Set([
    "open-api.us.tiktokglobalshop.com",
    "open-api-us.tiktokglobalshop.com",
]);

export const US_AUTHORIZE_URL =
    "https://services.us.tiktokshop.com/open/authorize";
export const GLOBAL_AUTHORIZE_URL =
    "https://auth.tiktok-shops.com/api/v2/authorize/";

export function isUsTiktokApiBase(
    base = process.env.TIKTOK_API_BASE
): boolean {
    if (!base?.trim()) {
        return false;
    }

    try {
        const host = new URL(
            base.includes("://") ? base : `https://${base}`
        ).hostname.toLowerCase();
        return US_API_HOSTS.has(host);
    } catch {
        return false;
    }
}

/**
 * US Partner Center apps must authorize on services.us.tiktokshop.com with
 * Service ID, which is not the App Key.
 */
export function tiktokSellerAuthorizeUrl(args: {
    appKey: string;
    serviceId?: string;
    state: string;
    redirectUri: string;
    scopes: string;
    apiBase?: string;
}): string {
    if (isUsTiktokApiBase(args.apiBase)) {
        if (!args.serviceId) {
            throw new Error(
                "TIKTOK_SERVICE_ID is required for US TikTok Shop. Copy Service ID from Partner Center app details, not App Key."
            );
        }
        const url = new URL(US_AUTHORIZE_URL);
        url.searchParams.set("service_id", args.serviceId);
        url.searchParams.set("state", args.state);
        return url.toString();
    }

    const url = new URL(GLOBAL_AUTHORIZE_URL);
    url.searchParams.set("app_key", args.appKey);
    url.searchParams.set("redirect_uri", args.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", args.scopes);
    url.searchParams.set("state", args.state);
    return url.toString();
}
