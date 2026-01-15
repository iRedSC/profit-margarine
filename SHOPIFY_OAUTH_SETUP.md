# Shopify OAuth Setup Guide

This guide will help you set up Shopify OAuth authentication for your Product Profitability Analyzer app.

## Overview

The app now supports Shopify OAuth, allowing users to connect their Shopify stores securely without manually entering access tokens.

## Setup Steps

### 1. Create a Shopify App

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Click **Apps** → **Create app**
3. Choose **Create app manually**
4. Fill in:
   - **App name**: Product Profitability Analyzer
   - **App URL**: Your deployment URL (get this from the Convex dashboard)

### 2. Configure OAuth Redirect URLs

In your Shopify app settings:

1. Go to **Configuration** → **URLs**
2. Add the following **Allowed redirection URL(s)**:
   ```
   https://your-deployment-name.convex.app/shopify/callback
   ```
   Replace `your-deployment-name` with your actual Convex deployment name.

### 3. Set API Scopes

In the **Configuration** tab, under **Admin API access scopes**, select:
- `read_orders`
- `read_products`

### 4. Get API Credentials

1. Go to **API credentials** tab
2. Copy the **API key** (this is your `SHOPIFY_CLIENT_ID`)
3. Copy the **API secret key** (this is your `SHOPIFY_CLIENT_SECRET`)

### 5. Configure Environment Variables

Add these environment variables to your Convex deployment:

1. Open the Convex dashboard
2. Go to **Settings** → **Environment Variables**
3. Add the following variables:
   - `SHOPIFY_CLIENT_ID`: Your Shopify API key
   - `SHOPIFY_CLIENT_SECRET`: Your Shopify API secret key

### 6. Connect Your Store

1. Sign in to your app
2. You'll see a "Connect Shopify Store" section
3. Enter your shop domain (e.g., `your-store.myshopify.com`)
4. Click "Connect Shopify Store"
5. You'll be redirected to Shopify to authorize the app
6. After authorization, you'll be redirected back to the app

### 7. Sync Orders

Once connected, click the "Sync All" button to fetch your Shopify orders!

## How It Works

### OAuth Flow

1. **User initiates connection**: User enters their shop domain and clicks "Connect"
2. **Redirect to Shopify**: App redirects to Shopify's OAuth authorization page
3. **User authorizes**: User reviews and approves the requested permissions
4. **Callback with code**: Shopify redirects back with an authorization code
5. **Exchange for token**: App exchanges the code for an access token
6. **Store credentials**: Access token is securely stored in the database
7. **Sync orders**: App can now fetch orders using the stored access token

### Security Features

- ✅ OAuth 2.0 standard authentication
- ✅ Secure token storage in Convex database
- ✅ No manual token handling required
- ✅ Automatic token refresh (if implemented)
- ✅ Per-store authentication

## Endpoints

The app exposes the following OAuth endpoints:

- **Install**: `GET /shopify/install?shop=your-store.myshopify.com`
- **Callback**: `GET /shopify/callback?code=...&shop=...`

## Troubleshooting

### "Shopify OAuth not configured" Error

**Solution**: Make sure you've set the `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` environment variables in your Convex deployment.

### "Missing required parameters" Error

**Solution**: Ensure your redirect URL in Shopify matches exactly: `https://your-deployment-name.convex.app/shopify/callback`

### Orders not syncing after connection

**Solution**: 
1. Check that your app has the correct API scopes (`read_orders`, `read_products`)
2. Verify the access token was stored correctly in the `shopifyConnections` table
3. Check the Convex logs for any error messages

### "Invalid redirect_uri" Error

**Solution**: 
1. Go to your Shopify app settings
2. Verify the redirect URI is added to **Allowed redirection URL(s)**
3. Make sure there are no trailing slashes or typos

## Multi-User Support

Currently, the OAuth implementation stores connections globally by shop domain. To add per-user support:

1. Update the `shopifyConnections` schema to include a `userId` field
2. Modify `storeShopifyConnection` to associate the connection with the logged-in user
3. Update `syncShopifyOrders` to use the user's specific connection

## Next Steps

After setting up OAuth:

1. ✅ Connect your Shopify store
2. ✅ Sync your orders
3. ✅ Import product costs via CSV
4. ✅ Analyze profitability across all marketplaces
5. ⏭️ Set up Amazon and eBay integrations (optional)

## Support

For issues or questions:
- Check the [Shopify OAuth documentation](https://shopify.dev/docs/apps/auth/oauth)
- Review the [Convex documentation](https://docs.convex.dev)
- Check the app logs in the Convex dashboard

---

## Comparison: OAuth vs Manual Token

| Feature | OAuth (New) | Manual Token (Old) |
|---------|-------------|-------------------|
| Setup complexity | Medium | Low |
| Security | High | Medium |
| User experience | Excellent | Poor |
| Token management | Automatic | Manual |
| Multi-store support | Yes | Limited |
| Revocation | Easy | Manual |
| Recommended | ✅ Yes | ❌ No |

OAuth is the recommended approach for production apps!
