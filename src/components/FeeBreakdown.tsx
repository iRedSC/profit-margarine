import { processFeeBreakdown } from "../lib/feeUtils";
import { BreakdownTooltip } from "./BreakdownTooltip";

type FeeBreakdownProps = {
    fees_breakdown?: Array<Array<string | number>>;
    totalFees: number;
};

export function FeeBreakdown({
    fees_breakdown,
    totalFees,
}: FeeBreakdownProps) {
    const { fees, hasEstimatedFees } = processFeeBreakdown(
        fees_breakdown,
        totalFees
    );

    if (fees.length === 0) {
        return <span>${totalFees.toFixed(2)}</span>;
    }

    return (
        <BreakdownTooltip
            rows={fees.map((fee) => ({
                label: fee.type,
                amount: fee.amount,
                isEstimated: fee.isEstimated,
            }))}
            totalLabel="Total Fees"
            totalAmount={totalFees}
            footer={
                hasEstimatedFees ? (
                    <span className="text-xs text-muted-foreground italic">
                        *Estimated
                    </span>
                ) : undefined
            }
        >
            ${totalFees.toFixed(2)}
        </BreakdownTooltip>
    );
}
