export type ShopifyBasicEvent = {
    action?: string;
    message?: string;
};

const LABEL_PURCHASE_COST =
    /purchased a \$([0-9,]+(?:\.[0-9]+)?)\s+shipping label/i;

export function shippingLabelCostFromEvents(
    events: ShopifyBasicEvent[]
): number {
    let total = 0;
    for (const event of events) {
        if (event.action !== "shipping_label_created_success") continue;
        const match = event.message?.match(LABEL_PURCHASE_COST);
        if (!match) continue;
        const amount = Number(match[1].split(",").join(""));
        if (Number.isFinite(amount)) total += amount;
    }
    return total;
}

export function applyShippingLabelEvents<
    T extends {
        storeShippingCost: number;
        shippingLabelAdjustment: number;
    },
>(financials: T, events: ShopifyBasicEvent[]): T {
    const storeShippingCost = shippingLabelCostFromEvents(events);
    if (storeShippingCost === 0) return financials;
    return {
        ...financials,
        storeShippingCost,
        shippingLabelAdjustment: 0,
    };
}
