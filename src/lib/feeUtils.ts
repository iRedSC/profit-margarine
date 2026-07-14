/**
 * Utility functions for fee estimation and formatting
 */

import {
    AMAZON_ESTIMATED_FEE_LABEL,
    EBAY_ESTIMATED_FEE_LABEL,
    SHOPIFY_TRANSACTION_FEE_FIXED_LABEL,
    SHOPIFY_TRANSACTION_FEE_PCT_LABEL,
} from "./feeConstants";

export type FeeBreakdown = Array<Array<string | number>>;

export interface ProcessedFee {
    type: string;
    rawType: string;
    amount: number;
    isEstimated: boolean;
}

const ESTIMATED_FEE_LABELS = new Set([
    EBAY_ESTIMATED_FEE_LABEL,
    AMAZON_ESTIMATED_FEE_LABEL,
    SHOPIFY_TRANSACTION_FEE_PCT_LABEL,
    SHOPIFY_TRANSACTION_FEE_FIXED_LABEL,
]);

/**
 * Check if a fee type is estimated based on known patterns
 */
export function isEstimatedFee(feeType: string): boolean {
    return ESTIMATED_FEE_LABELS.has(feeType);
}

/**
 * Format fee type text for display
 */
export function formatFeeType(feeType: string): string {
    // Remove "(Estimated)" or "(Estimated 15%)" from the text
    let formatted = feeType
        .replace(/ \(Estimated\)/gi, "")
        .replace(/ \(Estimated 15%\)/gi, "");

    // Replace underscores with spaces
    formatted = formatted.replace(/_/g, " ");

    // Convert to title case (capitalize first letter of each word)
    formatted = formatted.replace(/\b\w/g, (char) => char.toUpperCase());

    return formatted;
}

/**
 * Process fee breakdown array into typed format
 */
export function processFeeBreakdown(
    fees_breakdown: FeeBreakdown | undefined,
    totalFees: number
): {
    fees: ProcessedFee[];
    hasEstimatedFees: boolean;
} {
    if (!fees_breakdown || fees_breakdown.length === 0) {
        return { fees: [], hasEstimatedFees: false };
    }

    // Filter out fees with 0 amount and map to typed format
    const validFees = fees_breakdown
        .filter((fee) => {
            const amount = typeof fee[1] === "number" ? fee[1] : 0;
            return amount > 0;
        })
        .map((fee) => {
            const rawType = typeof fee[0] === "string" ? fee[0] : "Fee";
            const estimated = isEstimatedFee(rawType);
            return {
                type: formatFeeType(rawType),
                rawType: rawType,
                amount: typeof fee[1] === "number" ? fee[1] : 0,
                isEstimated: estimated,
            };
        });

    const hasEstimatedFees = validFees.some((fee) => fee.isEstimated);

    return { fees: validFees, hasEstimatedFees };
}
