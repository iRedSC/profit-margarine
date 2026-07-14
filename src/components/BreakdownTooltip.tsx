import { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export type BreakdownRow = {
  label: string;
  amount: number;
  isEstimated?: boolean;
  muted?: boolean;
};

type BreakdownTooltipProps = {
  rows: BreakdownRow[];
  totalLabel?: string;
  totalAmount?: number;
  footer?: ReactNode;
  widthClassName?: string;
  children: ReactNode;
};

export function BreakdownTooltip({
  rows,
  totalLabel,
  totalAmount,
  footer,
  widthClassName = "w-64",
  children,
}: BreakdownTooltipProps) {
  const showTotal = totalLabel !== undefined && totalAmount !== undefined;

  return (
    <Tooltip
      content={
        <div className={widthClassName}>
          <div className="space-y-2.5">
            {rows.map((row, index) => (
              <div
                key={index}
                className="flex justify-between items-center gap-4"
              >
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide truncate flex-shrink">
                  {row.label}
                  {row.isEstimated && (
                    <span className="text-muted-foreground/60 ml-1">*</span>
                  )}
                </span>
                <span
                  className={`text-sm font-semibold whitespace-nowrap flex-shrink-0 ${
                    row.muted ? "text-muted-foreground" : ""
                  }`}
                >
                  ${row.amount.toFixed(2)}
                </span>
              </div>
            ))}
            {showTotal && (
              <div className="border-t border-border pt-2.5 mt-2.5 flex justify-between items-center gap-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {totalLabel}
                </span>
                <span className="text-sm font-bold whitespace-nowrap flex-shrink-0">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
            )}
            {footer && (
              <div className="pt-1 mt-1 border-t border-border">{footer}</div>
            )}
          </div>
        </div>
      }
    >
      <span className="cursor-help underline decoration-dotted decoration-muted-foreground/50 hover:decoration-muted-foreground">
        {children}
      </span>
    </Tooltip>
  );
}
