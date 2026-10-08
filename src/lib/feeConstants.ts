// Single source of truth is the backend, which writes these labels into
// fee breakdowns. convex/lib/orderCosts.ts is pure, so importing it is safe.
export {
  AMAZON_ESTIMATED_FEE_LABEL,
  EBAY_ESTIMATED_FEE_LABEL,
  SHOPIFY_TRANSACTION_FEE_FIXED_LABEL,
  SHOPIFY_TRANSACTION_FEE_PCT_LABEL,
  TIKTOK_ESTIMATED_FEE_LABEL,
} from "../../convex/lib/orderCosts";
