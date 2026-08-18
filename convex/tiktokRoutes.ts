import {
    createOAuthCallbackHandler,
    createOAuthInstallHandler,
    jsonError,
} from "./lib/oauthHttp";
import {
    createOAuthReturnState,
    isAllowedOAuthReturnTo,
    originOrNull,
    readOAuthReturnTo,
} from "./lib/oauthReturnState";
import { tiktokSellerAuthorizeUrl, isUsTiktokApiBase } from "./tiktok/region";

function configuredFrontendUrl(): string {
    return (
        originOrNull(process.env.VITE_URL || "") ||
        originOrNull(process.env.SITE_URL || "") ||
        "http://localhost:5173"
    );
}

export const tiktokInstall = createOAuthInstallHandler({
    missingConfigMessage: "TikTok Shop OAuth not configured",
    buildAuthUrl: async ({ searchParams }) => {
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

        if (isUsTiktokApiBase() && !serviceId) {
            return jsonError(
                "TIKTOK_SERVICE_ID is required for US TikTok Shop. Copy Service ID from Partner Center app details, not App Key.",
                500
            );
        }

        const requestedReturnTo = searchParams.get("return_to");
        const fallback = configuredFrontendUrl();
        const returnTo =
            requestedReturnTo &&
            isAllowedOAuthReturnTo(requestedReturnTo, [
                process.env.VITE_URL,
                process.env.SITE_URL,
            ])
                ? originOrNull(requestedReturnTo) || fallback
                : fallback;

        const secret = process.env.TIKTOK_CLIENT_SECRET;
        const state = secret
            ? await createOAuthReturnState(returnTo, secret)
            : crypto.randomUUID();

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
    resolveFrontendUrl: async ({ frontendUrl, searchParams }) => {
        const secret = process.env.TIKTOK_CLIENT_SECRET;
        const state = searchParams.get("state");
        if (!secret || !state) {
            return frontendUrl;
        }
        return (await readOAuthReturnTo(state, secret)) || frontendUrl;
    },
    buildSuccessRedirect: ({ frontendUrl, searchParams }) => {
        const code = searchParams.get("code")!;
        const error = searchParams.get("error");
        if (error) {
            return `${frontendUrl}/?error=${encodeURIComponent(error)}`;
        }
        return `${frontendUrl}/?tiktok_code=${encodeURIComponent(code)}`;
    },
});
