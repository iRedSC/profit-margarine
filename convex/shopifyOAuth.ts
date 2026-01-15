"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const exchangeCodeForToken = internalAction({
  args: {
    code: v.string(),
    shop: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.SHOPIFY_CLIENT_ID;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Shopify OAuth credentials not configured");
    }

    // Exchange authorization code for access token
    const tokenUrl = `https://${args.shop}/admin/oauth/access_token`;
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: args.code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for token: ${error}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const scope = data.scope;

    // Store the connection in the database
    await ctx.runMutation(internal.shopifyMutations.storeShopifyConnection, {
      shop: args.shop,
      accessToken,
      scope,
    });

    return { success: true };
  },
});
