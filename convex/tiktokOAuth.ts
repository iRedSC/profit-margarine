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
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

        if (!clientKey || !clientSecret) {
            throw new Error("TikTok Shop OAuth credentials not configured");
        }

        // Exchange authorization code for access token
        // TikTok Shop API uses GET request with query parameters
        const tokenUrl = new URL(
            "https://auth.tiktok-shops.com/api/v2/token/get"
        );
        tokenUrl.searchParams.set("app_key", clientKey);
        tokenUrl.searchParams.set("app_secret", clientSecret);
        tokenUrl.searchParams.set("auth_code", args.code);
        tokenUrl.searchParams.set("grant_type", "authorized_code");

        const response = await fetch(tokenUrl.toString(), {
            method: "GET",
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
        await ctx.runMutation(
            internal.marketplaceConnections.storeMarketplaceConnection,
            {
                userId: args.userId,
                marketplace: "tiktok",
                accessToken,
                refreshToken,
                expiresAt: Date.now() + expiresIn * 1000,
            }
        );

        return { success: true };
    },
});

export const refreshAccessToken = internalAction({
    args: {
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

        if (!clientKey || !clientSecret) {
            throw new Error("TikTok Shop OAuth credentials not configured");
        }

        // Get the current connection
        const connection = await ctx.runQuery(
            internal.marketplaceConnections.getMarketplaceConnection,
            {
                userId: args.userId,
                marketplace: "tiktok",
            }
        );

        if (!connection || !connection.refreshToken) {
            throw new Error(
                "No TikTok Shop connection found or refresh token missing"
            );
        }

        // Refresh the access token
        // TikTok Shop API uses GET request with query parameters
        const tokenUrl = new URL(
            "https://auth.tiktok-shops.com/api/v2/token/get"
        );
        tokenUrl.searchParams.set("app_key", clientKey);
        tokenUrl.searchParams.set("app_secret", clientSecret);
        tokenUrl.searchParams.set("grant_type", "refresh_token");
        tokenUrl.searchParams.set("refresh_token", connection.refreshToken);

        const response = await fetch(tokenUrl.toString(), {
            method: "GET",
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to refresh token: ${error}`);
        }

        const data: any = await response.json();
        const accessToken: string = data.access_token;
        const refreshToken: string =
            data.refresh_token || connection.refreshToken; // Use new refresh token if provided, otherwise keep the old one
        const expiresIn: number = data.expires_in;

        // Update the connection in the database
        await ctx.runMutation(
            internal.marketplaceConnections.storeMarketplaceConnection,
            {
                userId: args.userId,
                marketplace: "tiktok",
                accessToken,
                refreshToken,
                expiresAt: Date.now() + expiresIn * 1000,
            }
        );

        return { success: true, accessToken };
    },
});
