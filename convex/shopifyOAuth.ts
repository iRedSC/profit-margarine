"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { parseOAuthTokenJson, requireTokenString } from "./lib/oauthHttp";

export const exchangeCodeForToken = internalAction({
    args: {
        code: v.string(),
        shop: v.string(),
        redirectUri: v.string(),
        userId: v.id("users"),
    },
    handler: async (ctx, args) => {
        const clientId = process.env.SHOPIFY_CLIENT_ID;
        const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error("Shopify OAuth credentials not configured");
        }

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

        const data = await parseOAuthTokenJson(
            response,
            "Failed to exchange code for token"
        );
        const accessToken = requireTokenString(data, "access_token");
        const scope = requireTokenString(data, "scope");

        await ctx.runMutation(internal.shopifyMutations.storeShopifyConnection, {
            shop: args.shop,
            accessToken,
            scope,
            userId: args.userId,
        });

        return { success: true };
    },
});
