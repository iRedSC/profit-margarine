import { Tooltip } from "./Tooltip";

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

export function ShippingBreakdown({
    shipping,
    shipping_breakdown,
    buyerPaidShipping,
    shippingPercentage,
}: ShippingBreakdownProps) {
    // Calculate net shipping cost (seller shipping - buyer paid shipping)
    const netShipping =
        buyerPaidShipping !== undefined
            ? shipping - buyerPaidShipping
            : shipping;

    const hasBreakdown =
        shipping_breakdown && shipping_breakdown.length > 0;
    const hasBuyerPaid =
        buyerPaidShipping !== undefined && buyerPaidShipping !== 0;

    // Show tooltip if there's breakdown or buyer paid shipping
    if (hasBreakdown || hasBuyerPaid) {
        return (
            <div className="flex flex-col items-end">
                <Tooltip
                    content={
                        <div className="w-56">
                            <div className="space-y-2.5">
                                {hasBreakdown ? (
                                    <>
                                        {shipping_breakdown.map(
                                            ([label, amount], idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex justify-between items-center"
                                                >
                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                        {String(label)}
                                                    </span>
                                                    <span className="text-sm font-semibold">
                                                        $
                                                        {typeof amount ===
                                                        "number"
                                                            ? amount.toFixed(2)
                                                            : parseFloat(
                                                                  String(amount)
                                                              ).toFixed(2)}
                                                    </span>
                                                </div>
                                            )
                                        )}
                                        {hasBuyerPaid && (
                                            <>
                                                <div className="flex justify-between items-center pt-1">
                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                        Buyer Paid
                                                    </span>
                                                    <span className="text-sm font-semibold text-muted-foreground">
                                                        $
                                                        {buyerPaidShipping!.toFixed(
                                                            2
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="border-t border-border pt-2.5 mt-2.5 flex justify-between items-center">
                                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                        Net Cost
                                                    </span>
                                                    <span className="text-sm font-bold">
                                                        ${netShipping.toFixed(2)}
                                                    </span>
                                                </div>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                Seller Shipping
                                            </span>
                                            <span className="text-sm font-semibold">
                                                ${shipping.toFixed(2)}
                                            </span>
                                        </div>
                                        {hasBuyerPaid && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                    Buyer Paid
                                                </span>
                                                <span className="text-sm font-semibold text-muted-foreground">
                                                    $
                                                    {buyerPaidShipping!.toFixed(
                                                        2
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                        <div className="border-t border-border pt-2.5 mt-2.5 flex justify-between items-center">
                                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                Net Cost
                                            </span>
                                            <span className="text-sm font-bold">
                                                ${netShipping.toFixed(2)}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    }
                >
                    <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 hover:decoration-muted-foreground">
                        ${netShipping.toFixed(2)}
                    </span>
                </Tooltip>
                <ShippingPercentageLabel shippingPercentage={shippingPercentage} />
            </div>
        );
    }

    // No breakdown, just show the net shipping
    return (
        <div className="flex flex-col items-end">
            <span>${netShipping.toFixed(2)}</span>
            <ShippingPercentageLabel shippingPercentage={shippingPercentage} />
        </div>
    );
}
