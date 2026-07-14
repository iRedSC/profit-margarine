export const AMAZON_ESTIMATED_FEE_LABEL = "Amazon Fee (Estimated 15%)";
export const AMAZON_ESTIMATED_FEE_RATE = 0.15;

export const EBAY_ESTIMATED_FEE_LABEL = "Final Value Fee (Estimated)";
export const EBAY_ESTIMATED_FEE_RATE = 0.1325;
export const EBAY_FEE_CAP_RATE = 0.25;

export const SHOPIFY_TRANSACTION_FEE_PCT_LABEL = "Transaction Fee (2.9%)";
export const SHOPIFY_TRANSACTION_FEE_FIXED_LABEL =
    "Transaction Fee (Fixed $0.30)";
export const SHOPIFY_TRANSACTION_FEE_RATE = 0.029;
export const SHOPIFY_TRANSACTION_FEE_FIXED = 0.3;

export type CostBreakdown = Array<[string, number] | Array<string | number>>;

/**
 * Split order-level shipping costs evenly across units.
 */
export function splitOrderCosts(args: {
    totalShipping: number;
    totalBuyerPaid?: number;
    totalQty: number;
}): {
    shippingPerUnit: number;
    buyerPaidPerUnit: number;
} {
    const qty = Math.max(1, args.totalQty);
    return {
        shippingPerUnit: args.totalShipping / qty,
        buyerPaidPerUnit: (args.totalBuyerPaid ?? 0) / qty,
    };
}

/**
 * Divide each breakdown line amount by quantity (per-unit).
 */
export function toPerUnitBreakdown(
    breakdown: CostBreakdown | undefined,
    qty: number
): CostBreakdown | undefined {
    if (!breakdown || breakdown.length === 0) return breakdown;
    const divisor = Math.max(1, qty);
    return breakdown.map(([label, amount]) => [
        label,
        (typeof amount === "number" ? amount : 0) / divisor,
    ]);
}

export function shippingPercentageOfPrice(
    shippingPerUnit: number,
    price: number
): number {
    if (!price) return 0;
    return (shippingPerUnit / price) * 100;
}
