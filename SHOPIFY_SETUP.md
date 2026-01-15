# Shopify Integration Setup Guide

⚠️ **IMPORTANT**: Shopify deprecated custom apps. OAuth is required but not yet implemented.

## Current Limitation

The app uses Shopify's GraphQL API but **does not yet implement OAuth authentication**. Shopify now requires all apps to use OAuth through the Partner Dashboard.

## Workaround: Use a Development Store Access Token

For testing purposes, you can use a development store with a manually generated access token:

### 1. Set Environment Variables

In the Convex dashboard (Database → Settings → Environment Variables), add:

- `SHOPIFY_SHOP`: Your shop domain (e.g., `your-store.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN`: Your Shopify Admin API access token
- `SHOPIFY_ALLOWED_CHANNELS` (optional): Comma-separated list of sales channels to sync (e.g., `Online Store,Point of Sale`). Leave empty to sync all channels.

### 2. Get Shopify Access Token

1. Go to your Shopify Admin: `https://your-store.myshopify.com/admin`
2. Navigate to **Settings** → **Apps and sales channels** → **Develop apps**
3. Click **Create an app** (or use an existing one)
4. Go to **Configuration** tab
5. Under **Admin API access scopes**, select:
   - `read_orders`
   - `read_products`
6. Click **Save**
7. Go to **API credentials** tab
8. Click **Install app**
9. Copy the **Admin API access token** and add it to your environment variables

### 3. Sync Orders

Click the "Sync All" button in the app to fetch your Shopify orders!

---

## Full Embedded App Setup (Advanced)

To embed the app directly in Shopify Admin:

### Step 1: Create a Shopify App

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Click **Apps** → **Create app**
3. Choose **Create app manually**
4. Fill in:
   - **App name**: Product Profitability Analyzer
   - **App URL**: Your deployment URL (e.g., `https://your-deployment-name.convex.app`)
   - **Allowed redirection URL(s)**: Your deployment URL + `/auth/callback`

### Step 2: Configure App Settings

1. In your app settings, go to **Configuration**
2. Set **App URL** to your deployment URL
3. Under **Embedded app**, enable **Embed your app in Shopify admin**
4. Set **App proxy URL** (optional)

### Step 3: Set API Scopes

In the **Configuration** tab, under **Admin API access scopes**, select:
- `read_orders`
- `read_products`
- `read_inventory`

### Step 4: Get API Credentials

1. Go to **API credentials** tab
2. Copy the **API key** (this is your `VITE_SHOPIFY_API_KEY`)
3. Copy the **API secret key**
4. Click **Install app** on a development store
5. Copy the **Admin API access token** (this is your `SHOPIFY_ACCESS_TOKEN`)

### Step 5: Configure Environment Variables

Add these to your Convex deployment:

```
SHOPIFY_SHOP=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx
VITE_SHOPIFY_API_KEY=your_api_key_here
```

### Step 6: Update App URLs

1. In Shopify Partners, update your app's **App URL** to include the Shopify parameters:
   ```
   https://your-deployment-name.convex.app?shop={{shop}}&host={{host}}
   ```

2. Set the **Allowed redirection URL(s)**:
   ```
   https://your-deployment-name.convex.app
   https://your-deployment-name.convex.app/auth/callback
   ```

### Step 7: Install on Your Store

1. In Shopify Partners, go to your app
2. Click **Select store** and choose your store
3. Click **Install app**
4. The app will now appear in your Shopify Admin under **Apps**

### Step 8: Access the Embedded App

1. Go to your Shopify Admin
2. Click **Apps** in the left sidebar
3. Click **Product Profitability Analyzer**
4. The app will load embedded in the Shopify Admin UI!

---

## Features Available in Embedded Mode

When running as an embedded Shopify app:

- ✅ Seamless integration with Shopify Admin UI
- ✅ Automatic Shopify order syncing
- ✅ Native Shopify look and feel
- ✅ Access to all app features
- ✅ Real-time profitability analysis

---

## Troubleshooting

### App doesn't load in Shopify Admin

1. Check that your `VITE_SHOPIFY_API_KEY` is correct
2. Verify the App URL in Shopify Partners matches your deployment URL
3. Check browser console for errors
4. Ensure your app is installed on the store

### Orders not syncing

1. Verify `SHOPIFY_SHOP` and `SHOPIFY_ACCESS_TOKEN` are set correctly
2. Check that your app has the required API scopes (`read_orders`, `read_products`)
3. Look at the Convex logs for error messages

### "Unauthorized" errors

1. Regenerate your Shopify access token
2. Make sure the token has the correct scopes
3. Verify the shop domain is correct (include `.myshopify.com`)

---

## Security Notes

- Never commit your Shopify credentials to version control
- Use environment variables for all sensitive data
- Regularly rotate your API tokens
- Only request the minimum required API scopes

---

## Support

For issues or questions:
- Check the [Shopify App Development docs](https://shopify.dev/docs/apps)
- Review the [Convex documentation](https://docs.convex.dev)
- Open an issue on GitHub

---

## Next Steps

After setup:
1. Sync your Shopify orders
2. Import product costs via CSV
3. Analyze profitability across all marketplaces
4. Set up Amazon and eBay integrations (optional)
