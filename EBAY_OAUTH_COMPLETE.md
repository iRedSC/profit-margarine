# eBay OAuth Setup - Complete! ✅

I've successfully set up OAuth authentication for eBay, similar to the Shopify implementation. Here's what was added:

## Files Created/Modified

### New Files:
1. **`convex/ebayOAuth.ts`** - Handles OAuth token exchange and refresh
2. **`convex/ebayRoutes.ts`** - HTTP routes for eBay OAuth flow
3. **`src/components/EbayConnect.tsx`** - UI component for connecting eBay
4. **`EBAY_OAUTH_SETUP.md`** - Complete setup instructions

### Modified Files:
1. **`convex/ebayMutations.ts`** - Added functions to store/retrieve eBay connections
2. **`convex/router.ts`** - Added eBay OAuth routes
3. **`convex/ebay.ts`** - Updated to use OAuth tokens from database
4. **`src/App.tsx`** - Added eBay OAuth callback handling and EbayConnect component
5. **`.env.local.example`** - Added eBay OAuth environment variables

## How It Works

### OAuth Flow:
1. User clicks "Connect eBay Account" button
2. User is redirected to eBay's OAuth page
3. User authorizes the app
4. eBay redirects back with an authorization code
5. The code is exchanged for access and refresh tokens
6. Tokens are stored in the database per user
7. Tokens are automatically refreshed when expired

### Key Features:
- ✅ Per-user OAuth tokens (no more shared environment variable)
- ✅ Automatic token refresh when expired
- ✅ Backward compatible with `EBAY_OAUTH_TOKEN` env var
- ✅ Support for both Production and Sandbox environments
- ✅ UI shows connection status
- ✅ Secure token storage in database

## Setup Instructions

### 1. Create eBay Developer App

1. Go to [eBay Developers](https://developer.ebay.com/)
2. Create an application
3. Configure OAuth redirect URI:
   ```
   https://YOUR_DEPLOYMENT_NAME.convex.site/ebay/callback
   ```
4. Request these scopes:
   - `https://api.ebay.com/oauth/api_scope`
   - `https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly`
   - `https://api.ebay.com/oauth/api_scope/sell.finances`

### 2. Set Environment Variables

In Convex Dashboard (Database → Settings → Environment Variables):

```
EBAY_CLIENT_ID=your_app_id
EBAY_CLIENT_SECRET=your_cert_id
EBAY_REDIRECT_URI=https://YOUR_DEPLOYMENT_NAME.convex.site/ebay/callback
EBAY_ENVIRONMENT=PRODUCTION
```

In `.env.local` (for frontend):

```
VITE_EBAY_CLIENT_ID=your_app_id
VITE_EBAY_ENVIRONMENT=PRODUCTION
```

### 3. Connect Your eBay Account

1. Open your app
2. You'll see an "Connect eBay Account" card
3. Click "Connect eBay Account"
4. Authorize the app on eBay
5. You'll be redirected back and see "eBay account connected successfully!"

### 4. Sync Orders

Click "Sync All" to fetch your eBay orders using the OAuth token!

## Database Schema

The `marketplaceConnections` table stores OAuth tokens:

```typescript
{
  userId: Id<"users">,
  marketplace: "ebay",
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  connectedAt: number,
}
```

## API Endpoints

- **`GET /ebay/install`** - Initiates OAuth flow
- **`GET /ebay/callback`** - Handles OAuth callback

## Components

- **`EbayConnect`** - Shows connection UI or connected status
- **`isEbayConnected`** - Query to check if user has connected eBay
- **`completeOAuthFlow`** - Mutation to complete OAuth after callback

## Token Management

- Tokens are stored per user in the database
- Access tokens expire after ~2 hours
- Refresh tokens are long-lived
- Tokens are automatically refreshed when expired
- Falls back to `EBAY_OAUTH_TOKEN` env var if no OAuth connection exists

## Testing

### Sandbox Mode:
```
EBAY_ENVIRONMENT=SANDBOX
VITE_EBAY_ENVIRONMENT=SANDBOX
```

### Production Mode:
```
EBAY_ENVIRONMENT=PRODUCTION
VITE_EBAY_ENVIRONMENT=PRODUCTION
```

## Security

- ✅ Tokens stored securely in database
- ✅ Per-user authentication
- ✅ Automatic token refresh
- ✅ No tokens in environment variables (except client credentials)
- ✅ OAuth 2.0 standard flow

## Next Steps

1. Set up your eBay Developer app
2. Configure environment variables
3. Connect your eBay account
4. Start syncing orders!

For detailed setup instructions, see `EBAY_OAUTH_SETUP.md`.
