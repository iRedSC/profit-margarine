import { isRecord } from "./token";
import {
    TIKTOK_ESTIMATED_FEE_LABEL,
    TIKTOK_ESTIMATED_FEE_RATE,
    type CostBreakdown,
} from "../lib/orderCosts";

export type SkuFinance = {
    skuId: string;
    quantity: number;
    fees: number;
    feesBreakdown: CostBreakdown;
    shipping: number;
    shippingBreakdown: CostBreakdown;
    buyerPaidShipping: number;
};

const SKIP_FEE_KEYS = new Set([
    "affiliate_commission_amount_before_pit",
    "affiliate_commission_before_pit_amount",
    "affiliate_commission_deposit",
    "affiliate_commission_release",
]);

const BUYER_TAX_KEYS = new Set([
    "sales_tax_amount",
    "sales_tax_payment_amount",
    "sales_tax_refund_amount",
    "tax_sales_tax_amount",
    "tax_sales_tax_payment_amount",
    "tax_sales_tax_refund_amount",
    "retail_delivery_fee_amount",
    "retail_delivery_fee_payment_amount",
    "retail_delivery_fee_refund_amount",
]);

const CUSTOMER_PAID_SHIPPING_KEYS = new Set([
    "customer_paid_shipping_fee_amount",
]);

export function parseSignedAmount(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (isRecord(value) && "amount" in value) {
        return parseSignedAmount(value.amount);
    }
    return 0;
}

function feeLabel(key: string): string {
    return key.replace(/_amount$/u, "");
}

function collectChargeBreakdown(
    source: unknown,
    skip: (key: string) => boolean
): CostBreakdown {
    if (!isRecord(source)) {
        return [];
    }

    const breakdown: CostBreakdown = [];
    for (const [key, value] of Object.entries(source)) {
        if (key === "supplementary_component" || skip(key)) {
            continue;
        }
        const amount = Math.abs(parseSignedAmount(value));
        if (amount > 0) {
            breakdown.push([feeLabel(key), amount]);
        }
    }
    return breakdown;
}

function parseSkuTransaction(raw: unknown): SkuFinance | null {
    if (!isRecord(raw)) {
        return null;
    }

    const skuId =
        typeof raw.sku_id === "string" && raw.sku_id ? raw.sku_id : "";
    const quantity = Math.max(1, Math.trunc(parseSignedAmount(raw.quantity) || 1));

    const feeTax = isRecord(raw.fee_tax_breakdown) ? raw.fee_tax_breakdown : {};
    const feesBreakdown = [
        ...collectChargeBreakdown(
            feeTax.fee,
            (key) => SKIP_FEE_KEYS.has(key) || BUYER_TAX_KEYS.has(key)
        ),
        ...collectChargeBreakdown(feeTax.tax, (key) => BUYER_TAX_KEYS.has(key)),
    ];
    const fees = feesBreakdown.reduce(
        (sum, [, amount]) => sum + (typeof amount === "number" ? amount : 0),
        0
    );

    const shippingSource = isRecord(raw.shipping_cost_breakdown)
        ? raw.shipping_cost_breakdown
        : {};
    let buyerPaidShipping = 0;
    let sellerShippingSigned = 0;
    const shippingBreakdown: CostBreakdown = [];

    for (const [key, value] of Object.entries(shippingSource)) {
        if (key === "supplementary_component") {
            continue;
        }
        const signed = parseSignedAmount(value);
        if (CUSTOMER_PAID_SHIPPING_KEYS.has(key)) {
            buyerPaidShipping += Math.abs(signed);
            continue;
        }
        sellerShippingSigned += signed;
        const abs = Math.abs(signed);
        if (abs > 0) {
            shippingBreakdown.push([feeLabel(key), abs]);
        }
    }

    return {
        skuId,
        quantity,
        fees,
        feesBreakdown,
        shipping: Math.max(0, -sellerShippingSigned),
        shippingBreakdown,
        buyerPaidShipping,
    };
}

function skuTransactionsFromPayload(payload: unknown): unknown[] {
    if (!isRecord(payload)) {
        return [];
    }
    if (Array.isArray(payload.sku_transactions)) {
        return payload.sku_transactions;
    }
    if (Array.isArray(payload.transactions)) {
        return payload.transactions;
    }
    if (isRecord(payload.data)) {
        return skuTransactionsFromPayload(payload.data);
    }
    return [];
}

/**
 * Parse Get Order Statement Transactions (`/finance/202501/orders/{id}/statement_transactions`).
 * Falls back to a single order-level row when SKU splits are absent.
 */
export function parseOrderFinance(payload: unknown): SkuFinance[] {
    const skuRows = skuTransactionsFromPayload(payload)
        .map(parseSkuTransaction)
        .filter((row): row is SkuFinance => row !== null);

    if (skuRows.length > 0) {
        return skuRows;
    }

    const data = isRecord(payload)
        ? isRecord(payload.data)
            ? payload.data
            : payload
        : null;
    if (!data) {
        return [];
    }

    if (!data.fee_tax_breakdown && !data.shipping_cost_breakdown) {
        return [];
    }

    const orderRow = parseSkuTransaction(data);
    return orderRow ? [orderRow] : [];
}

export function estimatedReferralFinance(price: number): SkuFinance {
    const fees = price * TIKTOK_ESTIMATED_FEE_RATE;
    return {
        skuId: "",
        quantity: 1,
        fees,
        feesBreakdown: [[TIKTOK_ESTIMATED_FEE_LABEL, fees]],
        shipping: 0,
        shippingBreakdown: [],
        buyerPaidShipping: 0,
    };
}

export type LineItemFinanceShare = {
    fees: number;
    feesBreakdown: CostBreakdown;
    shipping: number;
    shippingBreakdown: CostBreakdown;
    buyerPaidShipping: number;
};

function scaleBreakdown(
    breakdown: CostBreakdown,
    factor: number
): CostBreakdown {
    return breakdown.map(([label, amount]) => [
        label,
        (typeof amount === "number" ? amount : 0) * factor,
    ]);
}

function perUnitShare(
    row: SkuFinance,
    units: number
): LineItemFinanceShare {
    const divisor = Math.max(1, units);
    return {
        fees: row.fees / divisor,
        feesBreakdown: scaleBreakdown(row.feesBreakdown, 1 / divisor),
        shipping: row.shipping / divisor,
        shippingBreakdown: scaleBreakdown(row.shippingBreakdown, 1 / divisor),
        buyerPaidShipping: row.buyerPaidShipping / divisor,
    };
}

/**
 * Allocate statement-transaction totals onto sold units.
 * SKU rows split across units of that sku_id; a single order-level row splits across every unit.
 */
export function allocateFinanceToUnits(
    lineItems: Array<{ skuId: string; quantity: number; price: number }>,
    financeRows: SkuFinance[]
): LineItemFinanceShare[] {
    const totalUnits = lineItems.reduce((sum, item) => sum + item.quantity, 0);
    const hasSkuRows = financeRows.some((row) => row.skuId);
    const orderLevelRow =
        !hasSkuRows && financeRows.length === 1 ? financeRows[0] : undefined;

    const unitsBySku = new Map<string, number>();
    for (const item of lineItems) {
        unitsBySku.set(
            item.skuId,
            (unitsBySku.get(item.skuId) ?? 0) + item.quantity
        );
    }

    return lineItems.map((item) => {
        if (orderLevelRow) {
            return perUnitShare(orderLevelRow, Math.max(1, totalUnits));
        }

        const skuRow = financeRows.find(
            (row) => row.skuId && row.skuId === item.skuId
        );
        if (skuRow) {
            return perUnitShare(
                skuRow,
                Math.max(1, unitsBySku.get(item.skuId) ?? item.quantity)
            );
        }

        return perUnitShare(
            estimatedReferralFinance(item.price),
            1
        );
    });
}
