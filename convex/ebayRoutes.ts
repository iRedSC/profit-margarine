import {
    createOAuthCallbackHandler,
    createOAuthInstallHandler,
    jsonError,
} from "./lib/oauthHttp";

export const ebayInstall = createOAuthInstallHandler({
    missingConfigMessage: "eBay OAuth not configured",
    buildAuthUrl: () => {
        const clientId = process.env.EBAY_CLIENT_ID;
        const environment = process.env.EBAY_ENVIRONMENT || "PRODUCTION";
        const redirectUri = process.env.EBAY_REDIRECT_URI;

        if (!clientId) {
            return jsonError("eBay OAuth not configured", 500);
        }
        if (!redirectUri) {
            return jsonError("EBAY_REDIRECT_URI not configured", 500);
        }

        const scopes = [
            "https://api.ebay.com/oauth/api_scope",
            "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
            "https://api.ebay.com/oauth/api_scope/sell.finances",
        ].join(" ");

        const authUrl =
            environment === "SANDBOX"
                ? "https://auth.sandbox.ebay.com/oauth2/authorize"
                : "https://auth.ebay.com/oauth2/authorize";

        return `${authUrl}?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    },
});

export const ebayCallback = createOAuthCallbackHandler({
    requiredParams: ["code"],
    buildSuccessRedirect: ({ frontendUrl, searchParams }) =>
        `${frontendUrl}/?ebay_code=${encodeURIComponent(searchParams.get("code")!)}`,
});
