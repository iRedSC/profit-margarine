import {
    createOAuthCallbackHandler,
    createOAuthInstallHandler,
    jsonError,
} from "./lib/oauthHttp";
import {
    createOAuthReturnState,
    isAllowedOAuthReturnTo,
    originOrNull,
    parseOAuthReturnTo,
} from "./lib/oauthReturnState";
import { tiktokSellerAuthorizeUrl, isUsTiktokApiBase } from "./tiktok/region";

function configuredFrontendUrl(): string {
    return (
        originOrNull(process.env.VITE_URL || "") ||
        originOrNull(process.env.SITE_URL || "") ||
        "http://localhost:5173"
    );
}

function frontendUrlFromState(state: string | null, fallback: string): string {
    const parsed = state ? parseOAuthReturnTo(state) : undefined;
    if (
        parsed &&
        isAllowedOAuthReturnTo(parsed, [
            process.env.VITE_URL,
            process.env.SITE_URL,
        ])
    ) {
        return parsed;
    }
    return fallback;
}

export const tiktokInstall = createOAuthInstallHandler({
    missingConfigMessage: "TikTok Shop OAuth not configured",
    buildAuthUrl: ({ searchParams }) => {
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
            "seller.fulfillment.basic",
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

        return tiktokSellerAuthorizeUrl({
            appKey: clientKey,
            serviceId,
            state: createOAuthReturnState(returnTo),
            redirectUri,
            scopes,
        });
    },
});

export const tiktokCallback = createOAuthCallbackHandler({
    requiredParams: ["code"],
    resolveFrontendUrl: ({ frontendUrl, searchParams }) =>
        frontendUrlFromState(searchParams.get("state"), frontendUrl),
    buildSuccessRedirect: ({ frontendUrl, searchParams }) => {
        const code = searchParams.get("code")!;
        const error = searchParams.get("error");
        if (error) {
            return `${frontendUrl}/?error=${encodeURIComponent(error)}`;
        }
        const params = new URLSearchParams({ tiktok_code: code });
        const parsed = parseOAuthReturnTo(searchParams.get("state") ?? "");
        if (
            parsed &&
            isAllowedOAuthReturnTo(parsed, [
                process.env.VITE_URL,
                process.env.SITE_URL,
            ])
        ) {
            params.set("return_to", parsed);
        }
        return `${frontendUrl}/?${params.toString()}`;
    },
});
