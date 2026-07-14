import { BreakdownTooltip } from "./BreakdownTooltip";

type ShippingBreakdownProps = {
    shipping: number;
    shipping_breakdown?: Array<Array<string | number>>;
    buyerPaidShipping?: number;
    shippingPercentage?: number;
};

function ShippingPercentageLabel({
    shippingPercentage,
}: {
    shippingPercentage?: number;
}) {
    if (shippingPercentage === undefined || shippingPercentage === 100) {
        return null;
    }
    return (
        <span className="text-xs text-muted-foreground">
            ({shippingPercentage.toFixed(1)}%)
        </span>
    );
}

function parseAmount(amount: string | number): number {
    return typeof amount === "number" ? amount : parseFloat(String(amount));
}

export function ShippingBreakdown({
    shipping,
    shipping_breakdown,
    buyerPaidShipping,
    shippingPercentage,
}: ShippingBreakdownProps) {
    const netShipping =
        buyerPaidShipping !== undefined
            ? shipping - buyerPaidShipping
            : shipping;

    const hasBreakdown =
        shipping_breakdown && shipping_breakdown.length > 0;
    const hasBuyerPaid =
        buyerPaidShipping !== undefined && buyerPaidShipping !== 0;

    if (hasBreakdown || hasBuyerPaid) {
        const rows = hasBreakdown
            ? [
                  ...shipping_breakdown.map(([label, amount]) => ({
                      label: String(label),
                      amount: parseAmount(amount),
                  })),
                  ...(hasBuyerPaid
                      ? [
                            {
                                label: "Buyer Paid",
                                amount: buyerPaidShipping,
                                muted: true,
                            },
                        ]
                      : []),
              ]
            : [
                  { label: "Seller Shipping", amount: shipping },
                  ...(hasBuyerPaid
                      ? [
                            {
                                label: "Buyer Paid",
                                amount: buyerPaidShipping,
                                muted: true,
                            },
                        ]
                      : []),
              ];

        const showTotal = hasBuyerPaid || !hasBreakdown;

        return (
            <div className="flex flex-col items-end">
                <BreakdownTooltip
                    rows={rows}
                    totalLabel={showTotal ? "Net Cost" : undefined}
                    totalAmount={showTotal ? netShipping : undefined}
                    widthClassName="w-56"
                >
                    ${netShipping.toFixed(2)}
                </BreakdownTooltip>
                <ShippingPercentageLabel shippingPercentage={shippingPercentage} />
            </div>
        );
    }

    return (
        <div className="flex flex-col items-end">
            <span>${netShipping.toFixed(2)}</span>
            <ShippingPercentageLabel shippingPercentage={shippingPercentage} />
        </div>
    );
}
