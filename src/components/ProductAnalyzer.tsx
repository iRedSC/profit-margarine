import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useState } from "react";
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

export function ProductAnalyzer() {
    const products = useQuery(api.products.listProducts) || [];
    const updateMarketplaceCost = useMutation(
        api.products.updateMarketplaceCost
    );
    const resyncOrder = useMutation(api.products.resyncOrder);
    const shopDomain = useQuery(api.shopifyMutations.getShopDomain);

    const [sortField, setSortField] = useState<SortField>("fulfillmentDate");
    const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

    const [skuFilter, setSkuFilter] = useState("");
    const [marketplaceFilters, setMarketplaceFilters] = useState<Set<string>>(
        new Set()
    );
    const [dateRangeStart, setDateRangeStart] = useState<number | null>(() => {
        const range = getDateRange("today");
        return range.start;
    });
    const [dateRangeEnd, setDateRangeEnd] = useState<number | null>(() => {
        const range = getDateRange("today");
        return range.end;
    });

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
        setSkuFilter("");
        setMarketplaceFilters(new Set());
        setDateRange("today");
    };

    const filteredProducts = products.filter((product) => {
        if (
            skuFilter &&
            !product.sku.toLowerCase().includes(skuFilter.toLowerCase())
        ) {
            return false;
        }

        if (
            marketplaceFilters.size > 0 &&
            !marketplaceFilters.has(product.marketplace)
        ) {
            return false;
        }

        if (dateRangeStart !== null && product.orderDate < dateRangeStart) {
            return false;
        }
        if (dateRangeEnd !== null && product.orderDate > dateRangeEnd) {
            return false;
        }

        return true;
    });

    // Filter out products with no cost when sorting by profit or margin
    const productsToSort =
        sortField === "profit" || sortField === "margin"
            ? filteredProducts.filter((product) => product.cost !== undefined)
            : filteredProducts;

    const sortedProducts = [...productsToSort].sort((a, b) => {
        let aValue: any;
        let bValue: any;

        // Calculate net shipping for profit/margin calculations
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
            // Treat undefined cost as lowest cost (negative infinity for comparison)
            const aCost = a.cost !== undefined ? a.cost : -Infinity;
            const bCost = b.cost !== undefined ? b.cost : -Infinity;
            aValue = aCost;
            bValue = bCost;
        } else if (sortField === "shipping") {
            // Sort by net shipping cost
            aValue = aNetShipping;
            bValue = bNetShipping;
        } else if (sortField === "fulfillmentDate") {
            // Use fulfillmentDate with fallback to orderDate
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
        } else {
            return aValue < bValue ? 1 : -1;
        }
    });

    const costEditing = useCostEditing(updateMarketplaceCost, sortedProducts);

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
        OrderId: string | undefined
    ) => {
        return getOrderUrl(marketplace, OrderId, shopDomain ?? undefined);
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
                skuFilter={skuFilter}
                setSkuFilter={setSkuFilter}
                marketplaceFilters={marketplaceFilters}
                toggleMarketplaceFilter={toggleMarketplaceFilter}
                dateRangeStart={dateRangeStart}
                dateRangeEnd={dateRangeEnd}
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
                onSaveCost={handleSaveCost}
                onCancelEditing={costEditing.cancelEditing}
                getOrderUrl={getOrderUrlForProduct}
                onResyncOrder={handleResyncOrder}
            />
        </div>
    );
}
