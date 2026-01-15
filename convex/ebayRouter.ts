"use node";

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const ebayHttp = httpRouter();

// eBay OAuth - Install endpoint
ebayHttp.route({
    path: "/ebay/install",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
        try {
            const clientId = process.env.EBAY_CLIENT_ID;
            const environment = process.env.EBAY_ENVIRONMENT || "PRODUCTION";

            if (!clientId) {
                return new Response(
                    JSON.stringify({ error: "eBay OAuth not configured" }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            const url = new URL(req.url);
            const redirectUri = `${url.origin}/ebay/callback`;

            const scopes = [
                "https://api.ebay.com/oauth/api_scope",
                "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
                "https://api.ebay.com/oauth/api_scope/sell.finances",
            ].join(" ");

            const authUrl =
                environment === "SANDBOX"
                    ? "https://auth.sandbox.ebay.com/oauth2/authorize"
                    : "https://auth.ebay.com/oauth2/authorize";

            const oauthUrl = `${authUrl}?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;

            return new Response(null, {
                status: 302,
                headers: { Location: oauthUrl },
            });
        } catch (error) {
            console.error("Error in eBay install:", error);
            return new Response(
                JSON.stringify({ error: "Internal server error" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
    }),
});

// eBay OAuth - Callback endpoint
ebayHttp.route({
    path: "/ebay/callback",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
        try {
            const url = new URL(req.url);
            const code = url.searchParams.get("code");

            if (!code) {
                return new Response(
                    JSON.stringify({ error: "Missing authorization code" }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            // Redirect to frontend with the code
            // The frontend will complete the OAuth flow with the user's session
            const frontendUrl = process.env.VITE_URL || "http://localhost:5173";

            return new Response(null, {
                status: 302,
                headers: {
                    Location: `${frontendUrl}/?ebay_code=${encodeURIComponent(code)}`,
                },
            });
        } catch (error: any) {
            console.error("Error in eBay callback:", error);
            const frontendUrl = process.env.VITE_URL || "http://localhost:5173";
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `${frontendUrl}/?error=${encodeURIComponent(error.message)}`,
                },
            });
        }
    }),
});

export default ebayHttp;
