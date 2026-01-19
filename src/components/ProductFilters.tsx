import { DateRangeType, isDateRangeType } from "../lib/dateRangeUtils";
import { useState } from "react";

type ProductFiltersProps = {
    skuFilter: string;
    setSkuFilter: (value: string) => void;
    marketplaceFilters: Set<string>;
    toggleMarketplaceFilter: (marketplace: string) => void;
    dateRangeStart: number | null;
    dateRangeEnd: number | null;
    setDateRange: (rangeType: DateRangeType) => void;
    clearFilters: () => void;
};

const dateRangeOptions: Array<{
    value: DateRangeType;
    label: string;
    group: string;
}> = [
    { value: "today", label: "Today", group: "Current Period" },
    { value: "thisWeek", label: "This Week", group: "Current Period" },
    { value: "thisMonth", label: "This Month", group: "Current Period" },
    { value: "yesterday", label: "Yesterday", group: "Previous Period" },
    { value: "lastWeek", label: "Last Week", group: "Previous Period" },
    { value: "lastMonth", label: "Last Month", group: "Previous Period" },
    { value: "last24Hours", label: "Last 24 Hours", group: "Rolling Periods" },
    { value: "last7Days", label: "Last 7 Days", group: "Rolling Periods" },
    { value: "last30Days", label: "Last 30 Days", group: "Rolling Periods" },
    { value: "last90Days", label: "Last 3 Months", group: "Rolling Periods" },
    { value: "allTime", label: "All Time", group: "Rolling Periods" },
];

export function ProductFilters({
    skuFilter,
    setSkuFilter,
    marketplaceFilters,
    toggleMarketplaceFilter,
    dateRangeStart,
    dateRangeEnd,
    setDateRange,
    clearFilters,
}: ProductFiltersProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const getCurrentDateRangeType = (): DateRangeType => {
        for (const option of dateRangeOptions) {
            if (isDateRangeType(dateRangeStart, dateRangeEnd, option.value)) {
                return option.value;
            }
        }
        return "today";
    };

    const currentRange = dateRangeOptions.find(
        (opt) => opt.value === getCurrentDateRangeType()
    );
    const currentLabel = currentRange?.label || "Select date range";

    const handleDateRangeSelect = (rangeType: DateRangeType) => {
        setDateRange(rangeType);
        setIsDropdownOpen(false);
    };

    return (
        <div className="rounded-lg border bg-card p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Filter Products</h2>
                <button
                    type="button"
                    onClick={clearFilters}
                    className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors font-medium"
                >
                    Clear Filters
                </button>
            </div>
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Search SKU
                        </label>
                        <input
                            type="text"
                            value={skuFilter}
                            onChange={(e) => setSkuFilter(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Type to search..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Date Range
                        </label>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() =>
                                    setIsDropdownOpen(!isDropdownOpen)
                                }
                                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span>{currentLabel}</span>
                                <svg
                                    className={`h-4 w-4 opacity-50 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 9l-7 7-7-7"
                                    />
                                </svg>
                            </button>

                            {isDropdownOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setIsDropdownOpen(false)}
                                    />
                                    <div className="absolute z-20 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-80 overflow-auto">
                                        {[
                                            "Current Period",
                                            "Previous Period",
                                            "Rolling Periods",
                                        ].map((group) => (
                                            <div key={group}>
                                                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase bg-muted/50 sticky top-0">
                                                    {group}
                                                </div>
                                                {dateRangeOptions
                                                    .filter(
                                                        (opt) =>
                                                            opt.group === group
                                                    )
                                                    .map((option) => {
                                                        const isActive =
                                                            isDateRangeType(
                                                                dateRangeStart,
                                                                dateRangeEnd,
                                                                option.value
                                                            );
                                                        return (
                                                            <button
                                                                key={
                                                                    option.value
                                                                }
                                                                type="button"
                                                                onClick={() =>
                                                                    handleDateRangeSelect(
                                                                        option.value
                                                                    )
                                                                }
                                                                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                                                    isActive
                                                                        ? "bg-accent text-accent-foreground font-medium"
                                                                        : "hover:bg-accent hover:text-accent-foreground"
                                                                }`}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        );
                                                    })}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium mb-2">
                            Marketplace
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {["Amazon", "Ebay", "Shopify", "TikTok"].map(
                                (marketplace) => (
                                    <button
                                        key={marketplace}
                                        type="button"
                                        onClick={() =>
                                            toggleMarketplaceFilter(marketplace)
                                        }
                                        className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                            marketplaceFilters.has(marketplace)
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                        }`}
                                    >
                                        {marketplace}
                                    </button>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
