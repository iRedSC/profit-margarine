export type SortField = "sku" | "name" | "marketplace" | "price" | "cost" | "fees" | "shipping" | "profit" | "margin" | "orderDate" | "fulfillmentDate";
export type SortDirection = "asc" | "desc";

export type ShippingAmounts = {
  shipping: number;
  buyerPaidShipping?: number;
};

export function getNetShipping(product: ShippingAmounts): number {
  return product.shipping - (product.buyerPaidShipping ?? 0);
}

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

export function getOrderUrl(marketplace: string, orderId: string | undefined, shopDomain: string | undefined): string | null {
  if (!orderId) return null;
  
  switch (marketplace) {
    case "Amazon":
      return `https://sellercentral.amazon.com/orders-v3/order/${orderId}`;
    case "Ebay":
      return `https://www.ebay.com/sh/ord/details?orderid=${orderId}`;
    case "Shopify":
      if (!shopDomain) return null;
      return `https://${shopDomain}/admin/orders/${orderId}`;
    case "TikTok":
      return `https://seller-us.tiktok.com/order/detail?order_no=${encodeURIComponent(orderId)}&shop_region=US`;
    default:
      return null;
  }
}
