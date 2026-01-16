import { useState } from "react";
import { Id } from "../../convex/_generated/dataModel";
import {
    calculateProfit,
    calculateMargin,
    getOrderUrl,
} from "../lib/productUtils";
import { ContextMenu } from "./ContextMenu";
import { Tooltip } from "./Tooltip";

type Product = {
    _id: Id<"marketplaceProducts">;
    sku: string;
    name: string | undefined;
    marketplace: string;
    price: number;
    cost: number | undefined;
    fees: number;
    fees_breakdown?: Array<Array<string | number>>;
    shipping: number;
    shippingPercentage: number | undefined;
    buyerPaidShipping: number | undefined;
    orderDate: number;
    OrderId: string | undefined;
};

type ProductTableRowProps = {
    product: Product;
    isEditing: boolean;
    editingCostValue: string;
    setEditingCostValue: (value: string) => void;
    onStartEditing: (
        id: Id<"marketplaceProducts">,
        cost: number | undefined
    ) => void;
    onSaveCost: (
        id: Id<"marketplaceProducts">,
        moveToNext: boolean
    ) => Promise<void>;
    onCancelEditing: () => void;
    orderUrl: string | null;
    onResyncOrder?: (id: Id<"marketplaceProducts">) => Promise<void>;
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
    const truncatedName =
        product.name && product.name.length > 30
            ? product.name.substring(0, 30) + "..."
            : product.name;

    // Build shipping breakdown tooltip text
    const shippingBreakdown =
        product.buyerPaidShipping !== undefined
            ? `Seller Shipping: $${product.shipping.toFixed(2)}\nBuyer Paid Shipping: $${product.buyerPaidShipping.toFixed(2)}\nNet Shipping Cost: $${netShipping.toFixed(2)}`
            : `Shipping Cost: $${product.shipping.toFixed(2)}`;

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleResyncOrder = async () => {
        if (onResyncOrder) {
            await onResyncOrder(product._id);
        }
    };


    return (
        <>
            <tr
                className="hover:bg-gray-50"
                onContextMenu={handleContextMenu}
            >
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {product.sku}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <div className="group relative">
                    <span
                        className={
                            product.name && product.name.length > 30
                                ? "cursor-help"
                                : ""
                        }
                    >
                        {truncatedName}
                    </span>
                    {product.name && product.name.length > 30 && (
                        <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-[100] w-max max-w-md bg-white border border-gray-200 rounded-lg shadow-lg py-3 px-4">
                            <div className="text-sm text-gray-900 whitespace-normal break-words">
                                {product.name}
                            </div>
                            <div className="absolute -top-1.5 left-4">
                                <div className="w-3 h-3 bg-white border-l border-t border-gray-200 transform rotate-45"></div>
                            </div>
                        </div>
                    )}
                </div>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {orderUrl ? (
                    <a
                        href={orderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer"
                        title="View order"
                    >
                        {product.marketplace} →
                    </a>
                ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {product.marketplace}
                    </span>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                ${product.price.toFixed(2)}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                {isEditing ? (
                    <input
                        type="number"
                        step="1"
                        value={editingCostValue}
                        onChange={(e) => setEditingCostValue(e.target.value)}
                        className="w-24 px-2 py-1 border border-blue-500 rounded text-right"
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
                            void onSaveCost(product._id, false);
                        }}
                    />
                ) : (
                    <button
                        onClick={() =>
                            onStartEditing(product._id, product.cost || 0)
                        }
                        className={`hover:bg-gray-100 px-2 py-1 rounded w-24 text-right ${product.cost === undefined ? "text-orange-600 font-semibold" : ""}`}
                    >
                        {product.cost !== undefined
                            ? `${product.cost.toFixed(2)}`
                            : "Set cost"}
                    </button>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                {product.fees_breakdown &&
                    product.fees_breakdown.length > 0 &&
                    product.fees_breakdown.some(
                        (fee) =>
                            typeof fee[1] === "number" && fee[1] > 0
                    ) ? (
                    <Tooltip
                        content={(() => {
                            // Helper function to check if fee is estimated
                            // We know these specific fee types are estimated because they're created/calculated in the code
                            const isEstimated = (feeType: string): boolean => {
                                // eBay estimated fee (fallback when no API data)
                                if (feeType === "Final Value Fee (Estimated)") {
                                    return true;
                                }
                                // Amazon estimated fee (fallback when no API data)
                                if (feeType === "Amazon Fee (Estimated 15%)") {
                                    return true;
                                }
                                // Shopify fees are calculated (not from API)
                                if (feeType === "Transaction Fee (2.9%)" || feeType === "Transaction Fee (Fixed $0.30)") {
                                    return true;
                                }
                                return false;
                            };

                            // Helper function to format fee type text
                            const formatFeeType = (feeType: string, isEstimated: boolean): string => {
                                // Remove "(Estimated)" or "(Estimated 15%)" from the text
                                let formatted = feeType
                                    .replace(/ \(Estimated\)/gi, "")
                                    .replace(/ \(Estimated 15%\)/gi, "");
                                
                                // Replace underscores with spaces
                                formatted = formatted.replace(/_/g, " ");
                                
                                // Convert to title case (capitalize first letter of each word)
                                formatted = formatted.replace(/\b\w/g, (char) =>
                                    char.toUpperCase()
                                );
                                
                                return formatted;
                            };

                            // Filter out fees with 0 amount and map to typed format
                            const validFees = product.fees_breakdown
                                .filter((fee) => {
                                    const amount =
                                        typeof fee[1] === "number"
                                            ? fee[1]
                                            : 0;
                                    return amount > 0;
                                })
                                .map((fee) => {
                                    const rawType =
                                        typeof fee[0] === "string"
                                            ? fee[0]
                                            : "Fee";
                                    const estimated = isEstimated(rawType);
                                    return {
                                        type: formatFeeType(rawType, estimated),
                                        rawType: rawType,
                                        amount:
                                            typeof fee[1] === "number"
                                                ? fee[1]
                                                : 0,
                                        isEstimated: estimated,
                                    };
                                });

                            if (validFees.length === 0) {
                                return null;
                            }

                            const hasEstimatedFees = validFees.some(
                                (fee) => fee.isEstimated
                            );

                            return (
                                <div className="w-64">
                                    <div className="space-y-2.5">
                                        {validFees.map((fee, index) => (
                                            <div
                                                key={index}
                                                className="flex justify-between items-center gap-4"
                                            >
                                                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate flex-shrink">
                                                    {fee.type}
                                                    {fee.isEstimated && (
                                                        <span className="text-gray-400 ml-1">
                                                            *
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="text-sm font-semibold text-gray-900 whitespace-nowrap flex-shrink-0">
                                                    ${fee.amount.toFixed(2)}
                                                </span>
                                            </div>
                                        ))}
                                        <div className="border-t border-gray-200 pt-2.5 mt-2.5 flex justify-between items-center gap-4">
                                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                                Total Fees
                                            </span>
                                            <span className="text-sm font-bold text-gray-900 whitespace-nowrap flex-shrink-0">
                                                ${product.fees.toFixed(2)}
                                            </span>
                                        </div>
                                        {hasEstimatedFees && (
                                            <div className="pt-1 mt-1 border-t border-gray-100">
                                                <span className="text-xs text-gray-500 italic">
                                                    *Estimated
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    >
                        <span className="cursor-help underline decoration-dotted decoration-gray-400 hover:decoration-gray-600">
                            ${product.fees.toFixed(2)}
                        </span>
                    </Tooltip>
                ) : (
                    <span>${product.fees.toFixed(2)}</span>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                <div className="flex flex-col items-end">
                    {product.buyerPaidShipping !== undefined &&
                    product.buyerPaidShipping !== 0 ? (
                        <Tooltip
                            content={
                                <div className="w-56">
                                    <div className="space-y-2.5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                                Seller Shipping
                                            </span>
                                            <span className="text-sm font-semibold text-gray-900">
                                                ${product.shipping.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                                                Buyer Paid
                                            </span>
                                            <span className="text-sm font-semibold text-green-600">
                                                $
                                                {product.buyerPaidShipping.toFixed(
                                                    2
                                                )}
                                            </span>
                                        </div>
                                        <div className="border-t border-gray-200 pt-2.5 mt-2.5 flex justify-between items-center">
                                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                                Net Cost
                                            </span>
                                            <span className="text-sm font-bold text-gray-900">
                                                ${netShipping.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            }
                        >
                            <span className="cursor-help underline decoration-dotted decoration-gray-400 hover:decoration-gray-600">
                                ${netShipping.toFixed(2)}
                            </span>
                        </Tooltip>
                    ) : (
                        <span>${netShipping.toFixed(2)}</span>
                    )}
                    {product.shippingPercentage !== undefined &&
                        product.shippingPercentage !== 100 && (
                            <span className="text-xs text-gray-500">
                                ({product.shippingPercentage.toFixed(1)}%)
                            </span>
                        )}
                </div>
            </td>
            <td
                className={`px-6 py-4 whitespace-nowrap text-sm font-semibold text-right ${!hasCost ? "text-gray-900 blur-sm" : isDubious ? "text-yellow-600" : isProfitable ? "text-green-600" : "text-red-600"}`}
            >
                ${profit.toFixed(2)}
            </td>
            <td
                className={`px-6 py-4 whitespace-nowrap text-sm font-semibold text-right ${!hasCost ? "text-gray-900 blur-sm" : isDubious ? "text-yellow-600" : isProfitable ? "text-green-600" : "text-red-600"}`}
            >
                {margin.toFixed(1)}%
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-center">
                {!hasCost ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        ? No cost
                    </span>
                ) : isDubious ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        [!] Dubious
                    </span>
                ) : isProfitable ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ✓ Profitable
                    </span>
                ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        ✗ Loss
                    </span>
                )}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                {product.orderDate ? (
                    <>
                        <div>
                            {new Date(product.orderDate).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-gray-500">
                            {new Date(product.orderDate).toLocaleTimeString()}
                        </div>
                    </>
                ) : (
                    <div className="text-gray-400">-</div>
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
                            disabled: !onResyncOrder || (!product.orderId && !product.OrderId),
                        },
                    ]}
                />
            )}
        </>
    );
}
