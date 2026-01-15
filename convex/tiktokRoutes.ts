import { httpAction } from "./_generated/server";

export const tiktokInstall = httpAction(async (_ctx, req) => {
    try {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const redirectUri = process.env.TIKTOK_REDIRECT_URI;

        if (!clientKey) {
            return new Response(
                JSON.stringify({ error: "TikTok Shop OAuth not configured" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        if (!redirectUri) {
            return new Response(
                JSON.stringify({ error: "TIKTOK_REDIRECT_URI not configured" }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }

        // TikTok Shop OAuth scopes - adjust based on your needs
        // Scopes may need to be space-separated instead of comma-separated
        const scopes = [
            "shop.product.basic",
            "shop.product.detail",
            "shop.order.read",
        ].join(" ");

        // Generate a random state for CSRF protection
        const state = crypto.randomUUID();

        // TikTok Shop uses auth.tiktok-shops.com domain
        // Register your app at TikTok Shop Partner Center (not TikTok Developer Portal)
        // Authorization endpoint may be /api/v2/authorize instead of /api/v2/oauth/authorize
        const authUrl = `https://auth.tiktok-shops.com/api/v2/authorize/?app_key=${encodeURIComponent(clientKey)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;

        return new Response(null, {
            status: 302,
            headers: { Location: authUrl },
        });
    } catch (error) {
        console.error("Error in TikTok Shop install:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
});

export const tiktokCallback = httpAction(async (ctx, req) => {
    try {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
            const frontendUrl = process.env.VITE_URL || "http://localhost:5173";
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `${frontendUrl}/?error=${encodeURIComponent(error)}`,
                },
            });
        }

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
                Location: `${frontendUrl}/?tiktok_code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`,
            },
        });
    } catch (error: any) {
        console.error("Error in TikTok Shop callback:", error);
        const frontendUrl = process.env.VITE_URL || "http://localhost:5173";
        return new Response(null, {
            status: 302,
            headers: {
                Location: `${frontendUrl}/?error=${encodeURIComponent(error.message)}`,
            },
        });
    }
});
