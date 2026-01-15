"use node";

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const shopifyHttp = httpRouter();

// Shopify OAuth - Install endpoint
shopifyHttp.route({
  path: "/shopify/install",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const url = new URL(req.url);
      const shop = url.searchParams.get("shop");

      if (!shop) {
        return new Response(JSON.stringify({ error: "Missing shop parameter" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const clientId = process.env.SHOPIFY_CLIENT_ID;
      if (!clientId) {
        return new Response(JSON.stringify({ error: "Shopify OAuth not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      const redirectUri = `${url.origin}/shopify/callback`;
      const scopes = "read_orders,read_products";
      const nonce = crypto.randomUUID();

      const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${nonce}`;

      return new Response(null, {
        status: 302,
        headers: { Location: authUrl },
      });
    } catch (error) {
      console.error("Error in Shopify install:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }),
});

// Shopify OAuth - Callback endpoint
shopifyHttp.route({
  path: "/shopify/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    try {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const shop = url.searchParams.get("shop");

      if (!code || !shop) {
        return new Response(JSON.stringify({ error: "Missing required parameters" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Exchange code for access token
      await ctx.runAction(internal.shopifyOAuth.exchangeCodeForToken, {
        code,
        shop,
        redirectUri: `${url.origin}/shopify/callback`,
      });

      // Redirect to success page
      return new Response(null, {
        status: 302,
        headers: { Location: "/?shopify_connected=true" },
      });
    } catch (error: any) {
      console.error("Error in Shopify callback:", error);
      return new Response(null, {
        status: 302,
        headers: { Location: `/?error=${encodeURIComponent(error.message)}` },
      });
    }
  }),
});

export default shopifyHttp;
