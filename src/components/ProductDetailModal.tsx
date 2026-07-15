import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { ProductFilters } from "./ProductFilters";
import { ProductMetrics } from "./ProductMetrics";
import { ProductTable } from "./ProductTable";
import { useCostEditing } from "../hooks/useCostEditing";
import {
    SortField,
    SortDirection,
    calculateProfit,
    calculateMargin,
    getOrderUrl,
} from "../lib/productUtils";
import { DateRangeType, getDateRange } from "../lib/dateRangeUtils";
import { Product } from "../types/product";

type ProductDetailModalProps = {
    product: Product | null;
    allProducts: Product[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

function isSameItem(a: Product, b: Product): boolean {
    if (a.productId && b.productId) {
        return a.productId === b.productId;
    }
    return a.sku === b.sku;
}

export function ProductDetailModal({
    product,
    allProducts,
    open,
    onOpenChange,
}: ProductDetailModalProps) {
    const updateMarketplaceCost = useMutation(
        api.products.updateMarketplaceCost
    );
    const resyncOrder = useMutation(api.products.resyncOrder);
    const shopDomain = useQuery(api.shopifyMutations.getShopDomain);

    const [sortField, setSortField] = useState<SortField>("fulfillmentDate");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [marketplaceFilters, setMarketplaceFilters] = useState<Set<string>>(
        new Set()
    );
    const [dateRangeStart, setDateRangeStart] = useState<number | null>(() => {
        const range = getDateRange("allTime");
        return range.start;
    });
    const [dateRangeEnd, setDateRangeEnd] = useState<number | null>(() => {
        const range = getDateRange("allTime");
        return range.end;
    });

    const itemInstances = useMemo(() => {
        if (!product) {
            return [];
        }
        return allProducts.filter((p) => isSameItem(p, product));
    }, [allProducts, product]);

    const filteredProducts = useMemo(() => {
        return itemInstances.filter((item) => {
            if (
                marketplaceFilters.size > 0 &&
                !marketplaceFilters.has(item.marketplace)
            ) {
                return false;
            }

            const filterDate = item.fulfillmentDate ?? item.orderDate;
            if (dateRangeStart !== null && filterDate < dateRangeStart) {
                return false;
            }
            if (dateRangeEnd !== null && filterDate > dateRangeEnd) {
                return false;
            }

            return true;
        });
    }, [itemInstances, marketplaceFilters, dateRangeStart, dateRangeEnd]);

    const productsToSort = useMemo(() => {
        return sortField === "profit" || sortField === "margin"
            ? filteredProducts.filter((p) => p.cost !== undefined)
            : filteredProducts;
    }, [filteredProducts, sortField]);

    const sortedProducts = useMemo(() => {
        return [...productsToSort].sort((a, b) => {
            let aValue: any;
            let bValue: any;

            const aNetShipping =
                a.buyerPaidShipping !== undefined
                    ? a.shipping - a.buyerPaidShipping
                    : a.shipping;
            const bNetShipping =
                b.buyerPaidShipping !== undefined
                    ? b.shipping - b.buyerPaidShipping
                    : b.shipping;

            if (sortField === "profit") {
                aValue = calculateProfit(a.price, a.cost, a.fees, aNetShipping);
                bValue = calculateProfit(b.price, b.cost, b.fees, bNetShipping);
            } else if (sortField === "margin") {
                aValue = calculateMargin(a.price, a.cost, a.fees, aNetShipping);
                bValue = calculateMargin(b.price, b.cost, b.fees, bNetShipping);
            } else if (sortField === "cost") {
                aValue = a.cost !== undefined ? a.cost : -Infinity;
                bValue = b.cost !== undefined ? b.cost : -Infinity;
            } else if (sortField === "shipping") {
                aValue = aNetShipping;
                bValue = bNetShipping;
            } else if (sortField === "fulfillmentDate") {
                aValue = a.fulfillmentDate ?? a.orderDate;
                bValue = b.fulfillmentDate ?? b.orderDate;
            } else {
                aValue = a[sortField];
                bValue = b[sortField];
            }

            if (typeof aValue === "string" && typeof bValue === "string") {
                return sortDirection === "asc"
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            if (sortDirection === "asc") {
                return aValue > bValue ? 1 : -1;
            }
            return aValue < bValue ? 1 : -1;
        });
    }, [productsToSort, sortField, sortDirection]);

    const costEditing = useCostEditing(updateMarketplaceCost, sortedProducts);

    const toggleMarketplaceFilter = (marketplace: string) => {
        const newFilters = new Set(marketplaceFilters);
        if (newFilters.has(marketplace)) {
            newFilters.delete(marketplace);
        } else {
            newFilters.add(marketplace);
        }
        setMarketplaceFilters(newFilters);
    };

    const setDateRange = (rangeType: DateRangeType) => {
        const range = getDateRange(rangeType);
        setDateRangeStart(range.start);
        setDateRangeEnd(range.end);
    };

    const clearFilters = () => {
        setMarketplaceFilters(new Set());
        setDateRange("allTime");
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
    };

    const handleSaveCost = async (
        id: Id<"marketplaceProducts">,
        moveToNext: boolean
    ) => {
        await costEditing.saveCost(id, moveToNext);
    };

    const getOrderUrlForProduct = (
        marketplace: string,
        orderId: string | undefined
    ) => {
        return getOrderUrl(marketplace, orderId, shopDomain ?? undefined);
    };

    const handleResyncOrder = async (id: Id<"marketplaceProducts">) => {
        try {
            await resyncOrder({ marketplaceProductId: id });
        } catch {
            // Optionally show an error message
        }
    };

    if (!product) {
        return null;
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="fixed inset-0 left-0 top-0 z-50 flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
                <div className="flex h-full flex-col overflow-hidden bg-background">
                    <DialogHeader className="shrink-0 border-b px-6 py-4 pr-12">
                        <DialogTitle className="text-2xl font-bold">
                            {product.sku}
                        </DialogTitle>
                        <DialogDescription className="text-base">
                            {product.name}
                            <span className="text-muted-foreground">
                                {" "}
                                · {itemInstances.length}{" "}
                                {itemInstances.length === 1
                                    ? "instance"
                                    : "instances"}
                            </span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        <div className="mx-auto max-w-[1600px] space-y-8">
                            <ProductFilters
                                skuFilter=""
                                setSkuFilter={() => {}}
                                marketplaceFilters={marketplaceFilters}
                                toggleMarketplaceFilter={toggleMarketplaceFilter}
                                dateRangeStart={dateRangeStart}
                                dateRangeEnd={dateRangeEnd}
                                setDateRange={setDateRange}
                                clearFilters={clearFilters}
                                hideSearch
                                title="Filter Instances"
                            />

                            <ProductMetrics filteredProducts={filteredProducts} />

                            <ProductTable
                                products={sortedProducts}
                                allProducts={itemInstances}
                                sortField={sortField}
                                sortDirection={sortDirection}
                                onSort={handleSort}
                                editingCostId={costEditing.editingCostId}
                                editingCostValue={costEditing.editingCostValue}
                                setEditingCostValue={costEditing.setEditingCostValue}
                                onStartEditing={costEditing.startEditing}
                                onSaveCost={handleSaveCost}
                                onCancelEditing={costEditing.cancelEditing}
                                getOrderUrl={getOrderUrlForProduct}
                                onResyncOrder={handleResyncOrder}
                                emptyFilteredMessage="No instances match your filters. Try adjusting the date range or marketplace."
                                emptyAllMessage="No instances found for this item."
                            />
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
