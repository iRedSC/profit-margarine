import { httpAction } from "../_generated/server";

type OAuthInstallConfig = {
    missingConfigMessage: string;
    buildAuthUrl: (args: {
        origin: string;
        searchParams: URLSearchParams;
    }) => string | Response;
};

/**
 * Shared OAuth install handler: validate config, redirect to provider auth URL.
 */
export function createOAuthInstallHandler(config: OAuthInstallConfig) {
    return httpAction(async (_ctx, req) => {
        try {
            const url = new URL(req.url);
            const authUrlOrResponse = config.buildAuthUrl({
                origin: url.origin,
                searchParams: url.searchParams,
            });

            if (authUrlOrResponse instanceof Response) {
                return authUrlOrResponse;
            }

            return new Response(null, {
                status: 302,
                headers: { Location: authUrlOrResponse },
            });
        } catch (error: any) {
            console.error("OAuth install error:", error);
            return new Response(
                JSON.stringify({
                    error: error.message || "Internal server error",
                }),
                {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
    });
}

type OAuthCallbackConfig = {
    /** Query param names required on the callback URL */
    requiredParams: string[];
    /** Build frontend redirect when auth succeeds */
    buildSuccessRedirect: (args: {
        frontendUrl: string;
        searchParams: URLSearchParams;
    }) => string;
};

/**
 * Shared OAuth callback: validate params, redirect to frontend with code.
 * Does not exchange tokens — that happens in an authenticated mutation.
 */
export function createOAuthCallbackHandler(config: OAuthCallbackConfig) {
    return httpAction(async (_ctx, req) => {
        const frontendUrl = process.env.VITE_URL || "http://localhost:5173";
        try {
            const url = new URL(req.url);
            const oauthError = url.searchParams.get("error");
            if (oauthError) {
                return new Response(null, {
                    status: 302,
                    headers: {
                        Location: `${frontendUrl}/?error=${encodeURIComponent(oauthError)}`,
                    },
                });
            }

            for (const param of config.requiredParams) {
                if (!url.searchParams.get(param)) {
                    return new Response(
                        JSON.stringify({
                            error: `Missing required parameter: ${param}`,
                        }),
                        {
                            status: 400,
                            headers: { "Content-Type": "application/json" },
                        }
                    );
                }
            }

            return new Response(null, {
                status: 302,
                headers: {
                    Location: config.buildSuccessRedirect({
                        frontendUrl,
                        searchParams: url.searchParams,
                    }),
                },
            });
        } catch (error: any) {
            console.error("OAuth callback error:", error);
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `${frontendUrl}/?error=${encodeURIComponent(error.message || "OAuth failed")}`,
                },
            });
        }
    });
}

export function jsonError(message: string, status = 500): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
