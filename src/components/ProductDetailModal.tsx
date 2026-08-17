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
import { useProductFilters } from "../hooks/useProductFilters";
import {
    SortField,
    SortDirection,
    getOrderUrl,
} from "../lib/productUtils";
import {
    filterProducts,
    isSameProduct,
    sortProducts,
} from "../lib/productListUtils";
import { Product } from "../types/product";

type ProductDetailModalProps = {
    product: Product | null;
    allProducts: Product[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

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
    const {
        searchInput,
        setSearchInput,
        marketplaceFilters,
        toggleMarketplaceFilter,
        dateRangeType,
        setDateRange,
        dateRangeStart,
        dateRangeEnd,
        clearFilters,
    } = useProductFilters("allTime");

    const itemInstances = useMemo(() => {
        if (!product) {
            return [];
        }
        return allProducts.filter((p) => isSameProduct(p, product));
    }, [allProducts, product]);

    const filteredProducts = useMemo(
        () =>
            filterProducts(itemInstances, {
                marketplaces: marketplaceFilters,
                start: dateRangeStart,
                end: dateRangeEnd,
                dateField: "fulfillmentDate",
            }),
        [itemInstances, marketplaceFilters, dateRangeStart, dateRangeEnd]
    );

    const sortedProducts = useMemo(
        () => sortProducts(filteredProducts, sortField, sortDirection),
        [filteredProducts, sortField, sortDirection]
    );

    const costEditing = useCostEditing(updateMarketplaceCost);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDirection("asc");
        }
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
            <DialogContent className="fixed inset-4 left-4 top-4 z-50 flex h-auto w-auto max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-lg border bg-background p-0 shadow-lg">
                <div className="flex h-full flex-col overflow-hidden">
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
                                skuFilter={searchInput}
                                setSkuFilter={setSearchInput}
                                marketplaceFilters={marketplaceFilters}
                                toggleMarketplaceFilter={toggleMarketplaceFilter}
                                dateRangeType={dateRangeType}
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
                                onSaveCost={costEditing.saveCost}
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
