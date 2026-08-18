import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import { calculateProfit, calculateMargin } from "../lib/productUtils";
import { Product } from "../types/product";
import { ContextMenu } from "./ContextMenu";
import { Tooltip } from "./Tooltip";
import { FeeBreakdown } from "./FeeBreakdown";
import { ShippingBreakdown } from "./ShippingBreakdown";
import { AlertCircle } from "lucide-react";

type ProductTableRowProps = {
    product: Product;
    isEditing: boolean;
    editingCostValue: string;
    setEditingCostValue: (value: string) => void;
    onStartEditing: (
        id: Id<"marketplaceProducts">,
        cost: number | undefined
    ) => void;
    onSaveCost: (id: Id<"marketplaceProducts">) => Promise<void>;
    onCancelEditing: () => void;
    orderUrl: string | null;
    onResyncOrder?: (id: Id<"marketplaceProducts">) => Promise<void>;
    onRowClick?: (product: Product) => void;
};

export function ProductTableRow({
    product,
    isEditing,
    editingCostValue,
    setEditingCostValue,
    onStartEditing,
    onSaveCost,
    onCancelEditing,
    orderUrl,
    onResyncOrder,
    onRowClick,
}: ProductTableRowProps) {
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    // Calculate net shipping cost (seller shipping - buyer paid shipping)
    const netShipping =
        product.buyerPaidShipping !== undefined
            ? product.shipping - product.buyerPaidShipping
            : product.shipping;

    const profit = calculateProfit(
        product.price,
        product.cost,
        product.fees,
        netShipping
    );
    const margin = calculateMargin(
        product.price,
        product.cost,
        product.fees,
        netShipping
    );
    const isProfitable = profit > 0;
    const isDubious = profit > 0 && (margin < 5 || profit < 3);
    const hasCost = product.cost !== undefined;
    const hasZeroShipping = product.shipping === 0;
    const hasPendingShipping =
        product.marketplace === "TikTok" &&
        product.tiktokFinanceStatus !== "settled" &&
        hasZeroShipping;
    const truncatedName =
        product.name && product.name.length > 30
            ? product.name.substring(0, 30) + "..."
            : product.name;

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleResyncOrder = () => {
        if (onResyncOrder) {
            void onResyncOrder(product._id);
        }
    };

    const handleRowClick = () => {
        onRowClick?.(product);
    };

    return (
        <>
            <tr
                className={`border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted ${
                    onRowClick ? "cursor-pointer" : ""
                } ${
                    hasZeroShipping
                        ? "bg-destructive/10 border-destructive/30"
                        : !hasCost
                          ? "bg-muted/30"
                          : isDubious
                            ? "bg-warning/5"
                            : !isProfitable
                              ? "bg-destructive/5"
                              : ""
                }`}
                onClick={onRowClick ? handleRowClick : undefined}
                onContextMenu={handleContextMenu}
            >
                <td className="px-3 py-2 align-middle text-sm font-medium">
                    {product.sku}
                </td>
                <td className="px-3 py-2 align-middle text-sm">
                    {product.name && product.name.length > 30 ? (
                        <Tooltip
                            content={
                                <div className="text-sm text-popover-foreground whitespace-normal break-words max-w-md">
                                    {product.name}
                                </div>
                            }
                        >
                            <span className="cursor-help">{truncatedName}</span>
                        </Tooltip>
                    ) : (
                        <span>{truncatedName}</span>
                    )}
                </td>
                <td className="px-3 py-2 align-middle text-sm">
                    {orderUrl ? (
                        <a
                            href={orderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
                            title="View order"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {product.marketplace} →
                        </a>
                    ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                            {product.marketplace}
                        </span>
                    )}
                </td>
                <td className="px-3 py-2 align-middle text-right text-sm">
                    ${product.price.toFixed(2)}
                </td>
                <td
                    className="px-3 py-2 align-middle text-right text-sm"
                    onClick={(e) => e.stopPropagation()}
                >
                    {isEditing ? (
                        <input
                            type="number"
                            step="1"
                            value={editingCostValue}
                            onChange={(e) =>
                                setEditingCostValue(e.target.value)
                            }
                            className="flex h-7 w-24 rounded-md border border-input bg-transparent px-2 py-0.5 text-right text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                } else if (e.key === "Escape") {
                                    onCancelEditing();
                                }
                            }}
                            onBlur={() => {
                                void onSaveCost(product._id);
                            }}
                        />
                    ) : (
                        <button
                            onClick={() =>
                                onStartEditing(product._id, product.cost || 0)
                            }
                            className={`hover:bg-accent px-2 py-1 rounded w-24 text-right ${product.cost === undefined ? "text-destructive font-semibold" : ""}`}
                        >
                            {product.cost !== undefined
                                ? `${product.cost.toFixed(2)}`
                                : "Set cost"}
                        </button>
                    )}
                </td>
                <td className="px-3 py-2 align-middle text-right text-sm">
                    <FeeBreakdown
                        fees_breakdown={product.fees_breakdown}
                        totalFees={product.fees}
                    />
                </td>
                <td className="px-3 py-2 align-middle text-right text-sm">
                    <ShippingBreakdown
                        shipping={product.shipping}
                        shipping_breakdown={product.shipping_breakdown}
                        buyerPaidShipping={product.buyerPaidShipping}
                        shippingPercentage={product.shippingPercentage}
                        isPending={hasPendingShipping}
                    />
                </td>
                <td
                    className={`px-3 py-2 align-middle text-right text-sm font-semibold ${hasZeroShipping ? "blur-sm" : !hasCost ? "blur-sm" : isDubious ? "text-warning" : isProfitable ? "text-success" : "text-destructive"}`}
                >
                    ${profit.toFixed(2)}
                </td>
                <td
                    className={`px-3 py-2 align-middle text-right text-sm font-semibold ${hasZeroShipping ? "blur-sm" : !hasCost ? "blur-sm" : isDubious ? "text-warning" : isProfitable ? "text-success" : "text-destructive"}`}
                >
                    {margin.toFixed(1)}%
                </td>
                <td className="px-3 py-2 align-middle text-center text-sm">
                    {hasPendingShipping ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pending shipping
                        </span>
                    ) : hasZeroShipping ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            $0 Shipping
                        </span>
                    ) : !hasCost ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                            ? No cost
                        </span>
                    ) : isDubious ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                            [!] Dubious
                        </span>
                    ) : isProfitable ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                            ✓ Profitable
                        </span>
                    ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                            ✗ Loss
                        </span>
                    )}
                </td>
                <td className="px-3 py-2 align-middle text-center text-sm">
                    {product.orderDate ? (
                        <>
                            <div>
                                {new Date(
                                    product.orderDate
                                ).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {new Date(
                                    product.orderDate
                                ).toLocaleTimeString()}
                            </div>
                        </>
                    ) : (
                        <div className="text-muted-foreground">-</div>
                    )}
                </td>
                <td className="px-3 py-2 align-middle text-center text-sm">
                    {product.fulfillmentDate ? (
                        <>
                            <div>
                                {new Date(
                                    product.fulfillmentDate
                                ).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {new Date(
                                    product.fulfillmentDate
                                ).toLocaleTimeString()}
                            </div>
                        </>
                    ) : (
                        <div className="text-muted-foreground">-</div>
                    )}
                </td>
            </tr>
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    onClose={() => setContextMenu(null)}
                    items={[
                        {
                            label: "Resync Order",
                            onClick: handleResyncOrder,
                            disabled: !onResyncOrder || !product.orderId,
                        },
                    ]}
                />
            )}
        </>
    );
}
