const US_API_HOSTS = new Set([
    "open-api.us.tiktokglobalshop.com",
    "open-api-us.tiktokglobalshop.com",
]);

export const US_API_BASE = "https://open-api.us.tiktokglobalshop.com";
export const GLOBAL_API_BASE = "https://open-api.tiktokglobalshop.com";
export const US_AUTHORIZE_URL =
    "https://services.tiktokshops.us/open/authorize";
export const GLOBAL_AUTHORIZE_URL =
    "https://auth.tiktok-shops.com/api/v2/authorize/";

function hostnameOf(base: string): string {
    const url = base.includes("://") ? base : `https://${base}`;
    return new URL(url).hostname.toLowerCase();
}

/**
 * Partner API calls go to the global Open API host. The US-looking
 * open-api.us.tiktokglobalshop.com host is a dead nginx 404.
 */
export function tiktokApiBase(base = process.env.TIKTOK_API_BASE): string {
    const configured = base?.trim();
    if (!configured) {
        return GLOBAL_API_BASE;
    }
    try {
        if (US_API_HOSTS.has(hostnameOf(configured))) {
            return GLOBAL_API_BASE;
        }
        const url = configured.includes("://")
            ? configured
            : `https://${configured}`;
        return url.replace(/\/+$/, "");
    } catch {
        return GLOBAL_API_BASE;
    }
}

export function isUsTiktokApiBase(
    base = process.env.TIKTOK_API_BASE
): boolean {
    if (base?.trim()) {
        try {
            if (US_API_HOSTS.has(hostnameOf(base))) {
                return true;
            }
        } catch {
            return false;
        }
        if (base !== process.env.TIKTOK_API_BASE) {
            return false;
        }
    }
    return Boolean(process.env.TIKTOK_SERVICE_ID?.trim());
}

/**
 * US Partner Center apps must authorize on services.tiktokshops.us with
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
