import {
    AMAZON_ESTIMATED_FEE_LABEL,
    EBAY_ESTIMATED_FEE_LABEL,
    TIKTOK_ESTIMATED_FEE_LABEL,
} from "./orderCosts";

/**
 * Decides which stored orders are still waiting on real fees or shipping label
 * costs, and when to ask the marketplace again.
 *
 * Marketplaces don't say "this order's costs are final", so this works from
 * what processing stored: estimate labels, TikTok's settlement status, and
 * zero costs. A zero can be legitimate (Shopify order paid outside Shopify
 * Payments, free local delivery), so orders stop being checked once they are
 * COST_SETTLEMENT_WINDOW_MS old, and are checked less often as they age.
 */

export type MissingCost = "fees" | "shipping";

export const COST_SETTLEMENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const MIN_RECHECK_MS = HOUR_MS;
const MAX_RECHECK_MS = 24 * HOUR_MS;

const ESTIMATED_FEE_LABELS = new Set([
    AMAZON_ESTIMATED_FEE_LABEL,
    EBAY_ESTIMATED_FEE_LABEL,
    TIKTOK_ESTIMATED_FEE_LABEL,
]);

export type CostFields = {
    marketplace: "Amazon" | "Ebay" | "Shopify" | "TikTok";
    fees: number;
    fees_breakdown?: Array<Array<string | number>>;
    shipping: number;
    shippingEstimated?: boolean;
    isPickup?: boolean;
    tiktokFinanceStatus?: "estimated" | "unsettled" | "settled";
};

export function missingCosts(row: CostFields): MissingCost[] {
    const missing: MissingCost[] = [];

    const hasEstimatedFee = (row.fees_breakdown ?? []).some(
        ([label]) => typeof label === "string" && ESTIMATED_FEE_LABELS.has(label)
    );
    const feesPending =
        hasEstimatedFee ||
        (row.marketplace === "TikTok" && row.tiktokFinanceStatus !== "settled") ||
        // ShopifyQL lags behind the order and reports no fees until it catches up.
        (row.marketplace === "Shopify" && row.fees === 0);
    if (feesPending) missing.push("fees");

    if (row.shippingEstimated || (row.shipping === 0 && !row.isPickup)) {
        missing.push("shipping");
    }

    return missing;
}

/**
 * Recheck young orders often and older ones rarely: a quarter of the order's
 * age, between one hour and one day. Gives roughly 20 checks per order over
 * the settlement window instead of one per cron tick.
 */
export function isCostRefreshDue(args: {
    orderDate: number;
    lastCheckedAt: number;
    now: number;
}): boolean {
    const age = args.now - args.orderDate;
    if (age > COST_SETTLEMENT_WINDOW_MS) return false;
    const interval = Math.min(
        MAX_RECHECK_MS,
        Math.max(MIN_RECHECK_MS, age / 4)
    );
    return args.now - args.lastCheckedAt >= interval;
}
