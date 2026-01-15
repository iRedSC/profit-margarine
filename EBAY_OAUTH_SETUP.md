# eBay OAuth Setup Guide

This guide will help you set up OAuth authentication for eBay to automatically sync orders.

## Prerequisites

- An eBay Developer account
- Access to your Convex deployment

## Step 1: Create an eBay Developer Account

1. Go to [eBay Developers Program](https://developer.ebay.com/)
2. Sign in or create a new account
3. Accept the API License Agreement

## Step 2: Create an Application

1. Go to [My Account > Application Keys](https://developer.ebay.com/my/keys)
2. Click **Create an Application Key Set**
3. Choose your application type:
   - **Production**: For live eBay data
   - **Sandbox**: For testing with fake data
4. Fill in the application details:
   - **Application Title**: Product Profitability Analyzer
   - **Application Type**: Web Application

## Step 3: Configure OAuth Settings

1. In your application settings, find the **OAuth Redirect URIs** section
2. Add your redirect URI:
   ```
   https://YOUR_DEPLOYMENT_NAME.convex.site/ebay/callback
   ```
   Replace `YOUR_DEPLOYMENT_NAME` with your actual Convex deployment name.

3. Set the required OAuth scopes:
   - `https://api.ebay.com/oauth/api_scope` (Basic API access)
   - `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly` (Read order fulfillment data)
   - `https://api.ebay.com/oauth/api_scope/sell.finances` (Read financial data)

## Step 4: Get Your Credentials

From your application page, copy:
- **App ID (Client ID)**: This is your `EBAY_CLIENT_ID`
- **Cert ID (Client Secret)**: This is your `EBAY_CLIENT_SECRET`

## Step 5: Configure Environment Variables

In your Convex dashboard (Database → Settings → Environment Variables), add:

### Backend Variables (Convex)
```
EBAY_CLIENT_ID=your_app_id_here
EBAY_CLIENT_SECRET=your_cert_id_here
EBAY_REDIRECT_URI=https://YOUR_DEPLOYMENT_NAME.convex.site/ebay/callback
EBAY_ENVIRONMENT=PRODUCTION
```

For sandbox testing, use:
```
EBAY_ENVIRONMENT=SANDBOX
```

### Frontend Variables (.env.local)
```
VITE_EBAY_CLIENT_ID=your_app_id_here
VITE_EBAY_ENVIRONMENT=PRODUCTION
```

## Step 6: Update Your Redirect URI

Make sure the `EBAY_REDIRECT_URI` matches exactly what you configured in the eBay Developer Portal.

## Step 7: Connect Your eBay Account

1. Go to your app
2. Click "Connect eBay Account"
3. Sign in to eBay and authorize the app
4. You'll be redirected back to your app

## Step 8: Sync Orders

Once connected, click "Sync All" to fetch your eBay orders!

---

## Troubleshooting

### "OAuth credentials not configured" error

Make sure you've set all the required environment variables in both Convex and your `.env.local` file.

### "Invalid redirect URI" error

1. Check that your `EBAY_REDIRECT_URI` matches exactly what's in the eBay Developer Portal
2. Make sure you're using the correct deployment name
3. Verify the URI includes `/ebay/callback` at the end

### "Invalid scope" error

Make sure you've requested the correct scopes in the eBay Developer Portal:
- `https://api.ebay.com/oauth/api_scope`
- `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`
- `https://api.ebay.com/oauth/api_scope/sell.finances`

### Token expired errors

The app automatically refreshes tokens when they expire. If you see persistent token errors:
1. Disconnect and reconnect your eBay account
2. Check that your refresh token is being stored correctly

---

## Production vs Sandbox

### Sandbox (Testing)
- Use sandbox credentials from the eBay Developer Portal
- Set `EBAY_ENVIRONMENT=SANDBOX`
- Orders will be fake test data
- OAuth endpoint: `https://auth.sandbox.ebay.com/oauth2/authorize`
- API endpoint: `https://api.sandbox.ebay.com`

### Production (Live)
- Use production credentials from the eBay Developer Portal
- Set `EBAY_ENVIRONMENT=PRODUCTION`
- Orders will be real eBay data
- OAuth endpoint: `https://auth.ebay.com/oauth2/authorize`
- API endpoint: `https://api.ebay.com`

---

## Security Notes

- Never commit your eBay credentials to version control
- Use environment variables for all sensitive data
- Regularly rotate your API credentials
- Only request the minimum required scopes
- Store tokens securely in the database

---

## Additional Resources

- [eBay OAuth Documentation](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
- [eBay API Explorer](https://developer.ebay.com/DevZone/build-test/api-explorer/)
- [Convex Documentation](https://docs.convex.dev)

---

## Support

For issues or questions:
- Check the [eBay Developer Forums](https://community.ebay.com/t5/Developer-Forums/ct-p/developer-forums)
- Review the [Convex documentation](https://docs.convex.dev)
