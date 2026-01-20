import { Tooltip } from "./Tooltip";
import { processFeeBreakdown } from "../lib/feeUtils";

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

    // If no valid fees, just show the total
    if (fees.length === 0) {
        return <span>${totalFees.toFixed(2)}</span>;
    }

    return (
        <Tooltip
            content={
                <div className="w-64">
                    <div className="space-y-2.5">
                        {fees.map((fee, index) => (
                            <div
                                key={index}
                                className="flex justify-between items-center gap-4"
                            >
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate flex-shrink">
                                    {fee.type}
                                    {fee.isEstimated && (
                                        <span className="text-muted-foreground/60 ml-1">
                                            *
                                        </span>
                                    )}
                                </span>
                                <span className="text-sm font-semibold whitespace-nowrap flex-shrink-0">
                                    ${fee.amount.toFixed(2)}
                                </span>
                            </div>
                        ))}
                        <div className="border-t border-border pt-2.5 mt-2.5 flex justify-between items-center gap-4">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Total Fees
                            </span>
                            <span className="text-sm font-bold whitespace-nowrap flex-shrink-0">
                                ${totalFees.toFixed(2)}
                            </span>
                        </div>
                        {hasEstimatedFees && (
                            <div className="pt-1 mt-1 border-t border-border">
                                <span className="text-xs text-muted-foreground italic">
                                    *Estimated
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            }
        >
            <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 hover:decoration-muted-foreground">
                ${totalFees.toFixed(2)}
            </span>
        </Tooltip>
    );
}
