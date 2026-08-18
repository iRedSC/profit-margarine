import { httpAction } from "../_generated/server";

export function getErrorMessage(error: unknown): string | undefined {
    if (typeof error === "object" && error !== null && "message" in error) {
        const message = error.message;
        if (typeof message === "string") {
            return message;
        }
    }
    return undefined;
}

export async function parseOAuthTokenJson(
    response: Response,
    errorPrefix: string
): Promise<Record<string, unknown>> {
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`${errorPrefix}: ${error}`);
    }

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) {
        throw new Error("Invalid token response");
    }
    return data as Record<string, unknown>;
}

export function requireTokenString(
    data: Record<string, unknown>,
    field: string
): string {
    const value = data[field];
    if (typeof value !== "string") {
        throw new Error(`Invalid token response: ${field}`);
    }
    return value;
}

export function optionalTokenString(
    data: Record<string, unknown>,
    field: string
): string | undefined {
    if (data[field] === undefined) {
        return undefined;
    }
    return requireTokenString(data, field);
}

type OAuthInstallConfig = {
    missingConfigMessage: string;
    buildAuthUrl: (args: {
        origin: string;
        searchParams: URLSearchParams;
    }) => string | Response | Promise<string | Response>;
    onError?: (error: unknown) => Response;
};

/**
 * Shared OAuth install handler: validate config, redirect to provider auth URL.
 */
export function createOAuthInstallHandler(config: OAuthInstallConfig) {
    return httpAction(async (_ctx, req) => {
        try {
            const url = new URL(req.url);
            const authUrlOrResponse = await config.buildAuthUrl({
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
        } catch (error: unknown) {
            if (config.onError) {
                return config.onError(error);
            }
            console.error("OAuth install error:", error);
            return jsonError(
                getErrorMessage(error) || "Internal server error"
            );
        }
    });
}

type OAuthCallbackConfig = {
    /** Query param names required on the callback URL */
    requiredParams: string[];
    /** When set, any missing required param uses this message instead of a per-param message. */
    missingParamsMessage?: string;
    /** When false, skip redirecting `error` query params to the frontend. Default true. */
    redirectOnProviderError?: boolean;
    /** Build frontend redirect when auth succeeds */
    buildSuccessRedirect: (args: {
        frontendUrl: string;
        searchParams: URLSearchParams;
    }) => string | Promise<string>;
    /** Override VITE_URL when the provider echoes a trusted return origin in state */
    resolveFrontendUrl?: (args: {
        frontendUrl: string;
        searchParams: URLSearchParams;
    }) => string | Promise<string>;
    onError?: (error: unknown, frontendUrl: string) => Response;
};

/**
 * Shared OAuth callback: validate params, redirect to frontend with code.
 * Does not exchange tokens — that happens in an authenticated mutation.
 */
export function createOAuthCallbackHandler(config: OAuthCallbackConfig) {
    return httpAction(async (_ctx, req) => {
        const configuredFrontendUrl =
            process.env.VITE_URL ||
            process.env.SITE_URL ||
            "http://localhost:5173";
        let frontendUrl = configuredFrontendUrl;
        try {
            const url = new URL(req.url);
            frontendUrl =
                (await config.resolveFrontendUrl?.({
                    frontendUrl: configuredFrontendUrl,
                    searchParams: url.searchParams,
                })) || configuredFrontendUrl;
            if (config.redirectOnProviderError !== false) {
                const oauthError = url.searchParams.get("error");
                if (oauthError) {
                    return new Response(null, {
                        status: 302,
                        headers: {
                            Location: `${frontendUrl}/?error=${encodeURIComponent(oauthError)}`,
                        },
                    });
                }
            }

            for (const param of config.requiredParams) {
                if (!url.searchParams.get(param)) {
                    return jsonError(
                        config.missingParamsMessage ||
                            `Missing required parameter: ${param}`,
                        400
                    );
                }
            }

            return new Response(null, {
                status: 302,
                headers: {
                    Location: await config.buildSuccessRedirect({
                        frontendUrl,
                        searchParams: url.searchParams,
                    }),
                },
            });
        } catch (error: unknown) {
            if (config.onError) {
                return config.onError(error, frontendUrl);
            }
            console.error("OAuth callback error:", error);
            return new Response(null, {
                status: 302,
                headers: {
                    Location: `${frontendUrl}/?error=${encodeURIComponent(getErrorMessage(error) || "OAuth failed")}`,
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
