export type SortField = "sku" | "name" | "marketplace" | "price" | "cost" | "fees" | "shipping" | "profit" | "margin" | "orderDate" | "fulfillmentDate";
export type SortDirection = "asc" | "desc";

export function calculateProfit(price: number, cost: number | undefined, fees: number, shipping: number): number {
  return price - (cost || 0) - fees - shipping;
}

export function calculateMargin(price: number, cost: number | undefined, fees: number, shipping: number): number {
  const profit = calculateProfit(price, cost, fees, shipping);
  return price > 0 ? (profit / price) * 100 : 0;
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function getOrderUrl(marketplace: string, OrderId: string | undefined, shopDomain: string | undefined): string | null {
  if (!OrderId) return null;
  
  switch (marketplace) {
    case "Amazon":
      return `https://sellercentral.amazon.com/orders-v3/order/${OrderId}`;
    case "Ebay":
      return `https://www.ebay.com/sh/ord/details?orderid=${OrderId}`;
    case "Shopify":
      if (!shopDomain) return null;
      return `https://${shopDomain}/admin/orders/${OrderId}`;
    case "TikTok":
      return `https://seller-us.tiktok.com/order/detail/${OrderId}`;
    default:
      return null;
  }
}