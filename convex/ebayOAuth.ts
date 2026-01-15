"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const exchangeCodeForToken = internalAction({
  args: {
    code: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const environment = process.env.EBAY_ENVIRONMENT || "PRODUCTION";

    if (!clientId || !clientSecret) {
      throw new Error("eBay OAuth credentials not configured");
    }

    // Determine the correct eBay API endpoint
    const tokenUrl = environment === "SANDBOX"
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";

    // Create Basic Auth header
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    // Exchange authorization code for access token
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: args.code,
        redirect_uri: process.env.EBAY_REDIRECT_URI || "",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for token: ${error}`);
    }

    const data: any = await response.json();
    const accessToken: string = data.access_token;
    const refreshToken: string = data.refresh_token;
    const expiresIn: number = data.expires_in; // seconds

    // Store the connection in the database
    await ctx.runMutation(internal.marketplaceConnections.storeMarketplaceConnection, {
      userId: args.userId,
      marketplace: "ebay",
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    return { success: true };
  },
});

export const refreshAccessToken = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    const environment = process.env.EBAY_ENVIRONMENT || "PRODUCTION";

    if (!clientId || !clientSecret) {
      throw new Error("eBay OAuth credentials not configured");
    }

    // Get the current connection
    const connection = await ctx.runQuery(internal.marketplaceConnections.getMarketplaceConnection, {
      userId: args.userId,
      marketplace: "ebay",
    });

    if (!connection || !connection.refreshToken) {
      throw new Error("No eBay connection found or refresh token missing");
    }

    // Determine the correct eBay API endpoint
    const tokenUrl = environment === "SANDBOX"
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";

    // Create Basic Auth header
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    // Refresh the access token
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
        scope: "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.finances",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to refresh token: ${error}`);
    }

    const data: any = await response.json();
    const accessToken: string = data.access_token;
    const expiresIn: number = data.expires_in;

    // Update the connection in the database
    await ctx.runMutation(internal.marketplaceConnections.storeMarketplaceConnection, {
      userId: args.userId,
      marketplace: "ebay",
      accessToken,
      refreshToken: connection.refreshToken, // Keep the same refresh token
      expiresAt: Date.now() + expiresIn * 1000,
    });

    return { success: true, accessToken };
  },
});
