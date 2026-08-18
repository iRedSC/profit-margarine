# Product Profitability Analyzer

A comprehensive tool for analyzing product profitability across multiple marketplaces including Amazon, eBay, Shopify, and TikTok.

## Features

- **Multi-Marketplace Support**: Sync orders from Amazon, eBay, and Shopify
- **Cost Management**: Import product costs via CSV/Excel files
- **Profitability Analysis**: Real-time profit and margin calculations
- **Shopify Embedded App**: Can be embedded directly in Shopify Admin UI
- **Filtering & Sorting**: Advanced filtering by SKU, marketplace, and date range
- **Real-time Sync**: Live updates as orders are synced

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your credentials:

```bash
cp .env.local.example .env.local
```

#### Required Variables:

- `VITE_CONVEX_URL`: Your Convex deployment URL
- `SHOPIFY_SHOP`: Your Shopify store domain (e.g., `your-store.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN`: Shopify Admin API access token
- `VITE_SHOPIFY_API_KEY`: Shopify API key (for embedded app)

#### Optional Variables (for other marketplaces):

- Amazon SP-API credentials
- eBay API credentials

### 3. Set Up Shopify App (for embedded mode)

1. Create a new app in your Shopify Partner Dashboard
2. Set the App URL to your deployment URL
3. Add the following scopes:
   - `read_orders`
   - `read_products`
   - `read_reports` (ShopifyQL requires Level 2 protected customer data access; custom apps may receive this automatically)
4. Install the app on your Shopify store
5. Copy the API key and access token to your `.env.local`

### 4. Deploy

```bash
pnpm dev
```

## Quality checks

Run the same type checking, linting, contract tests, and production build used by CI:

```bash
pnpm check
```

Use `pnpm test:watch` while changing business rules. The contract tests in `tests/`
cover profitability, marketplace normalization, filtering and sorting, Amazon fees,
and data import/export compatibility.

## Usage

### Syncing Orders

Click the "Sync All" button to fetch orders from all configured marketplaces.

### Exporting Data

1. Click "Export" → "Export Data"
2. Download an Excel file of all profitability table rows (SKU, marketplace, price, cost, fees, shipping, dates, order IDs, etc.)

### Exporting Costs

1. Click "Export" → "Export Costs"
2. Download an Excel file of unique SKUs with name and cost (compatible with Import Costs)

### Importing Data

1. Click "Import" → "Import Data"
2. Upload a CSV or Excel file exported from this app (or with the same columns)
3. Rows are matched by `id` when present, otherwise by marketplace + orderId + SKU + orderDate, then updated or created

### Importing Costs

1. Click "Import" → "Import Costs"
2. Upload a CSV or Excel file with columns for SKU and Cost
3. The system will automatically match SKUs and update costs

### Analyzing Profitability

- View profit and margin for each product
- Filter by marketplace, date range, or SKU
- Sort by any column
- See overview statistics including total profit, average margin, and unprofitable items

## Embedding in Shopify

When accessed via Shopify Admin, the app automatically detects the embedded context and initializes Shopify App Bridge for seamless integration.

The app will appear as a native Shopify admin page with full access to your store's orders and products.

## Support

For issues or questions, please open an issue on GitHub.
