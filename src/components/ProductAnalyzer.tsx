import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState, useMemo } from "react";
import { ProductFilters } from "./ProductFilters";
import { ProductMetrics } from "./ProductMetrics";
import { ProductTable } from "./ProductTable";
import { ProductDetailModal } from "./ProductDetailModal";
import { useCostEditing } from "../hooks/useCostEditing";
import { useProductFilters } from "../hooks/useProductFilters";
import {
    SortField,
    SortDirection,
    getOrderUrl,
} from "../lib/productUtils";
import { filterProducts, sortProducts } from "../lib/productListUtils";
import { Product } from "../types/product";

export function ProductAnalyzer() {
    const productsQuery = useQuery(api.products.listProducts);
    const products = useMemo(() => productsQuery ?? [], [productsQuery]);
    const updateMarketplaceCost = useMutation(
        api.products.updateMarketplaceCost
    );
    const resyncOrder = useMutation(api.products.resyncOrder);
    const shopDomain = useQuery(api.shopifyMutations.getShopDomain);

    const [sortField, setSortField] = useState<SortField>("fulfillmentDate");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(
        null
    );
    const {
        searchInput,
        setSearchInput,
        search,
        marketplaceFilters,
        toggleMarketplaceFilter,
        dateRangeType,
        setDateRange,
        dateRangeStart,
        dateRangeEnd,
        clearFilters,
    } = useProductFilters("today");

    const filteredProducts = useMemo(
        () =>
            filterProducts(products, {
                search,
                marketplaces: marketplaceFilters,
                start: dateRangeStart,
                end: dateRangeEnd,
                dateField: "fulfillmentDate",
            }),
        [products, search, marketplaceFilters, dateRangeStart, dateRangeEnd]
    );

    const sortedProducts = useMemo(
        () =>
            sortProducts(filteredProducts, sortField, sortDirection, search),
        [filteredProducts, sortField, sortDirection, search]
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
            // Optionally show a success message or refresh data
        } catch {
            // Optionally show an error message
        }
    };

    return (
        <div className="space-y-8">
            <ProductFilters
                skuFilter={searchInput}
                setSkuFilter={setSearchInput}
                marketplaceFilters={marketplaceFilters}
                toggleMarketplaceFilter={toggleMarketplaceFilter}
                dateRangeType={dateRangeType}
                setDateRange={setDateRange}
                clearFilters={clearFilters}
            />

            <ProductMetrics filteredProducts={filteredProducts} />

            <ProductTable
                products={sortedProducts}
                allProducts={products}
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
                onRowClick={setSelectedProduct}
            />

            <ProductDetailModal
                key={
                    selectedProduct
                        ? (selectedProduct.productId ?? selectedProduct.sku)
                        : "closed"
                }
                product={selectedProduct}
                allProducts={products}
                open={selectedProduct !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedProduct(null);
                    }
                }}
            />
        </div>
    );
}
