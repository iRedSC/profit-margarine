import {
    createOAuthCallbackHandler,
    createOAuthInstallHandler,
    jsonError,
} from "./lib/oauthHttp";
import { tiktokSellerAuthorizeUrl, isUsTiktokApiBase } from "./tiktok/region";

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
        const serviceId = process.env.TIKTOK_SERVICE_ID;
        const scopes = [
            "seller.authorization.info",
            "seller.order.info",
            "seller.finance.info",
        ].join(" ");
        const state = crypto.randomUUID();

        if (isUsTiktokApiBase() && !serviceId) {
            return jsonError(
                "TIKTOK_SERVICE_ID is required for US TikTok Shop. Copy Service ID from Partner Center app details, not App Key.",
                500
            );
        }

        return tiktokSellerAuthorizeUrl({
            appKey: clientKey,
            serviceId,
            state,
            redirectUri,
            scopes,
        });
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
