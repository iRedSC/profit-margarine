"use node";

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ebayInstall, ebayCallback } from "./ebayRoutes";
import { tiktokInstall, tiktokCallback } from "./tiktokRoutes";

const http = httpRouter();

// Shopify OAuth - Install endpoint
http.route({
    path: "/shopify/install",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
        try {
            const url = new URL(req.url);
            const shop = url.searchParams.get("shop");

            if (!shop) {
                return new Response(
                    JSON.stringify({ error: "Missing shop parameter" }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            const clientId = process.env.SHOPIFY_CLIENT_ID;
            if (!clientId) {
                return new Response(
                    JSON.stringify({ error: "Shopify OAuth not configured" }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            const redirectUri = `${url.origin}/shopify/callback`;
            const scopes = "read_orders,read_products";
            const nonce = crypto.randomUUID();

            const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

            return new Response(null, {
                status: 302,
                headers: { Location: authUrl },
            });
        } catch (error: any) {
            const log = {
                endpoint: "/shopify/install",
                step: "install",
                error: error.message || String(error),
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

// Shopify OAuth - Callback endpoint
http.route({
    path: "/shopify/callback",
    method: "GET",
    handler: httpAction(async (ctx, req) => {
        try {
            const url = new URL(req.url);
            const code = url.searchParams.get("code");
            const shop = url.searchParams.get("shop");

            if (!code || !shop) {
                return new Response(
                    JSON.stringify({ error: "Missing required parameters" }),
                    {
                        status: 400,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            await ctx.runAction(internal.shopifyOAuth.exchangeCodeForToken, {
                code,
                shop,
                redirectUri: `${url.origin}/shopify/callback`,
            });

            // Redirect to the frontend URL (Vite dev server or production)
            const frontendUrl = process.env.VITE_URL || "http://localhost:5173";
            return new Response(null, {
                status: 302,
                headers: { Location: `${frontendUrl}/?shopify_connected=true` },
            });
        } catch (error: any) {
            const log = {
                endpoint: "/shopify/callback",
                step: "callback",
                error: error.message || String(error),
                timestamp: new Date().toISOString(),
            };
            console.error(JSON.stringify(log));
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
        } catch (error: any) {
            const log = {
                endpoint: "/amazon/webhook",
                step: "process_webhook",
                error: error.message || String(error),
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
            // Verify the token from the Authorization header
            const authHeader = req.headers.get("Authorization");
            const expectedToken = process.env.EBAY_VERIFICATION_TOKEN;

            if (!expectedToken) {
                // console.error("EBAY_VERIFICATION_TOKEN not configured");
                return new Response(
                    JSON.stringify({ error: "Server configuration error" }),
                    {
                        status: 500,
                        headers: { "Content-Type": "application/json" },
                    }
                );
            }

            // Check if the token matches
            const verified = authHeader === `Bearer ${expectedToken}`;

            if (!verified) {
                // console.warn("Invalid verification token received");
                return new Response(JSON.stringify({ error: "Unauthorized" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                });
            }

            const body = await req.json();

            const notificationType = body.metadata?.topic;

            switch (notificationType) {
                case "MARKETPLACE_ACCOUNT_DELETION":
                    await ctx.runMutation(
                        internal.ebayMutations.logAccountDeletion,
                        {
                            ebayUserId:
                                body.notification?.data?.userId || "unknown",
                            username:
                                body.notification?.data?.username || "unknown",
                            deletionDate:
                                body.notification?.data?.deletionDate ||
                                new Date().toISOString(),
                            notificationData: JSON.stringify(body),
                            verified: true,
                        }
                    );
                    break;

                case "MARKETPLACE_ACCOUNT_CLOSURE":
                    break;

                default:
                    // Unhandled notification type
                    break;
            }

            return new Response(
                JSON.stringify({ message: "Notification processed" }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            );
        } catch (error: any) {
            const log = {
                endpoint: "/ebay/notifications",
                step: "process_notification",
                error: error.message || String(error),
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
        } catch (error: any) {
            const log = {
                endpoint: "/ebay/notifications",
                step: "process_challenge",
                error: error.message || String(error),
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
