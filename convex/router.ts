"use node";

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ebayInstall, ebayCallback } from "./ebayRoutes";
import { tiktokInstall, tiktokCallback } from "./tiktokRoutes";
import {
    createOAuthCallbackHandler,
    createOAuthInstallHandler,
    getErrorMessage,
    jsonError,
} from "./lib/oauthHttp";

const http = httpRouter();

const shopifyInstall = createOAuthInstallHandler({
    missingConfigMessage: "Shopify OAuth not configured",
    buildAuthUrl: ({ origin, searchParams }) => {
        const shop = searchParams.get("shop");

        if (!shop) {
            return jsonError("Missing shop parameter", 400);
        }

        const clientId = process.env.SHOPIFY_CLIENT_ID;
        if (!clientId) {
            return jsonError("Shopify OAuth not configured", 500);
        }

        const redirectUri = `${origin}/shopify/callback`;
        const scopes = "read_orders,read_products";
        const nonce = crypto.randomUUID();

        return `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;
    },
    onError: (error) => {
        const log = {
            endpoint: "/shopify/install",
            step: "install",
            error: getErrorMessage(error) || String(error),
            timestamp: new Date().toISOString(),
        };
        console.error(JSON.stringify(log));
        return jsonError("Internal server error");
    },
});

const shopifyCallback = createOAuthCallbackHandler({
    requiredParams: ["code", "shop"],
    missingParamsMessage: "Missing required parameters",
    redirectOnProviderError: false,
    buildSuccessRedirect: ({ frontendUrl, searchParams }) =>
        `${frontendUrl}/?shopify_code=${encodeURIComponent(searchParams.get("code")!)}&shop=${encodeURIComponent(searchParams.get("shop")!)}`,
    onError: (error, frontendUrl) => {
        console.error(
            JSON.stringify({
                endpoint: "/shopify/callback",
                error: getErrorMessage(error) || String(error),
            })
        );
        return new Response(null, {
            status: 302,
            headers: {
                Location: `${frontendUrl}/?error=${encodeURIComponent(`${getErrorMessage(error)}`)}`,
            },
        });
    },
});

// Shopify OAuth - Install endpoint
http.route({
    path: "/shopify/install",
    method: "GET",
    handler: shopifyInstall,
});

// Shopify OAuth - Callback endpoint (token exchange happens via authenticated mutation)
http.route({
    path: "/shopify/callback",
    method: "GET",
    handler: shopifyCallback,
});

// Amazon webhook endpoint for order fulfillment notifications
http.route({
    path: "/amazon/webhook",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
        try {
            const body = await req.json();

            // Amazon SNS sends different message types
            if (body.Type === "SubscriptionConfirmation") {
                return new Response(
                    JSON.stringify({
                        message: "Subscription confirmation received",
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            if (body.Type === "Notification") {
                const message = JSON.parse(body.Message);

                if (message.NotificationType === "ORDER_FULFILLMENT") {
                    const orderId = message.Payload.OrderId;
                    const userId = "PLACEHOLDER_USER_ID" as Id<"users">;

                    await ctx.runAction(internal.amazon.processAmazonOrder, {
                        userId,
                        orderId,
                    });

                    return new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
            }

            return new Response(
                JSON.stringify({ message: "Event type not handled" }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        } catch (error: unknown) {
            const log = {
                endpoint: "/amazon/webhook",
                step: "process_webhook",
                error: getErrorMessage(error) || String(error),
                timestamp: new Date().toISOString(),
            };
            console.error(JSON.stringify(log));
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

// eBay notification endpoint - POST for receiving notifications
http.route({
    path: "/ebay/notifications",
    method: "POST",
    handler: httpAction(async (ctx, req) => {
        try {
            // Accept and acknowledge the notification request
            // We don't need to process it, just return success
            const body = await req.json().catch(() => ({}));
            
            // Log the notification for debugging purposes (optional)
            const notificationType = body.metadata?.topic;
            console.log("eBay notification received:", {
                type: notificationType,
                timestamp: new Date().toISOString(),
            });

            // Always return success to acknowledge receipt
            return new Response(
                JSON.stringify({ message: "Notification received" }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        } catch (error: unknown) {
            // Even on error, return 200 to ensure eBay doesn't mark us as down
            // Log the error for debugging
            console.error("eBay notification error:", {
                endpoint: "/ebay/notifications",
                error: getErrorMessage(error) || String(error),
                timestamp: new Date().toISOString(),
            });
            
            return new Response(
                JSON.stringify({ message: "Notification received" }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        }
    }),
});

// eBay challenge endpoint - GET for webhook verification
http.route({
    path: "/ebay/notifications",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
        try {
            const url = new URL(req.url);
            const challengeCode = url.searchParams.get("challenge_code");

            if (challengeCode) {
                const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;
                if (!verificationToken) {
                    return new Response(
                        JSON.stringify({ error: "Server configuration error" }),
                        {
                            status: 500,
                            headers: { "Content-Type": "application/json" },
                        }
                    );
                }

                const encoder = new TextEncoder();
                const data = encoder.encode(
                    challengeCode +
                        verificationToken +
                        url.origin +
                        url.pathname
                );
                const hashBuffer = await crypto.subtle.digest("SHA-256", data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const challengeResponse = hashArray
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");

                return new Response(JSON.stringify({ challengeResponse }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                });
            }

            return new Response(
                JSON.stringify({
                    message: "eBay notification endpoint is active",
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        } catch (error: unknown) {
            const log = {
                endpoint: "/ebay/notifications",
                step: "process_challenge",
                error: getErrorMessage(error) || String(error),
                timestamp: new Date().toISOString(),
            };
            console.error(JSON.stringify(log));
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

// eBay OAuth routes
http.route({
    path: "/ebay/install",
    method: "GET",
    handler: ebayInstall,
});

http.route({
    path: "/ebay/callback",
    method: "GET",
    handler: ebayCallback,
});

// TikTok Shop OAuth routes
http.route({
    path: "/tiktok/install",
    method: "GET",
    handler: tiktokInstall,
});

http.route({
    path: "/tiktok/callback",
    method: "GET",
    handler: tiktokCallback,
});

export default http;
