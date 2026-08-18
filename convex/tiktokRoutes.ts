import {
    createOAuthCallbackHandler,
    createOAuthInstallHandler,
    jsonError,
} from "./lib/oauthHttp";

export const tiktokInstall = createOAuthInstallHandler({
    missingConfigMessage: "TikTok Shop OAuth not configured",
    buildAuthUrl: () => {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const siteUrl = process.env.CONVEX_SITE_URL;

        if (!clientKey) {
            return jsonError("TikTok Shop OAuth not configured", 500);
        }
        if (!siteUrl) {
            return jsonError("CONVEX_SITE_URL not configured", 500);
        }

        const redirectUri = `${siteUrl}/tiktok/callback`;

        const scopes = [
            "seller.authorization.info",
            "seller.order.info",
            "seller.finance.info",
        ].join(" ");

        const state = crypto.randomUUID();

        return `https://auth.tiktok-shops.com/api/v2/authorize/?app_key=${encodeURIComponent(clientKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
    },
});

export const tiktokCallback = createOAuthCallbackHandler({
    requiredParams: ["code"],
    buildSuccessRedirect: ({ frontendUrl, searchParams }) => {
        const code = searchParams.get("code")!;
        const state = searchParams.get("state");
        const error = searchParams.get("error");
        if (error) {
            return `${frontendUrl}/?error=${encodeURIComponent(error)}`;
        }
        return `${frontendUrl}/?tiktok_code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
    },
});
