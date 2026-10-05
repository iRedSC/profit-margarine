import {
    DateRangeSelection,
    DateRangeType,
    formatMonthKey,
    recentMonthKeys,
    toDayKey,
} from "../lib/dateRangeUtils";
import type { ProductDateField } from "../lib/productListUtils";
import { useMemo, useState } from "react";

type ProductFiltersProps = {
    skuFilter: string;
    setSkuFilter: (value: string) => void;
    marketplaceFilters: Set<string>;
    toggleMarketplaceFilter: (marketplace: string) => void;
    dateRange: DateRangeSelection;
    setDateRange: (range: DateRangeSelection) => void;
    dateField: ProductDateField;
    setDateField: (field: ProductDateField) => void;
    clearFilters: () => void;
    hideSearch?: boolean;
    title?: string;
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
    dateRange,
    setDateRange,
    dateField,
    setDateField,
    clearFilters,
    hideSearch = false,
    title = "Filter Products",
}: ProductFiltersProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const monthKeys = useMemo(() => recentMonthKeys(12), []);

    const currentLabel =
        dateRange.kind === "preset"
            ? (dateRangeOptions.find((opt) => opt.value === dateRange.preset)
                  ?.label ?? "Select date range")
            : dateRange.kind === "month"
              ? formatMonthKey(dateRange.month)
              : "Custom Range";

    const handleDateRangeSelect = (range: DateRangeSelection) => {
        setDateRange(range);
        setIsDropdownOpen(false);
    };

    const startCustomRange = () => {
        const now = new Date();
        handleDateRangeSelect({
            kind: "custom",
            start: toDayKey(new Date(now.getFullYear(), now.getMonth(), 1)),
            end: toDayKey(now),
        });
    };

    const optionClass = (isActive: boolean) =>
        `w-full text-left px-4 py-2 text-sm transition-colors ${
            isActive
                ? "bg-accent text-accent-foreground font-medium"
                : "hover:bg-accent hover:text-accent-foreground"
        }`;
    const groupHeaderClass =
        "px-3 py-2 text-xs font-semibold text-muted-foreground uppercase bg-muted/50 sticky top-0";
    const inputClass =
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

    return (
        <div className="rounded-lg border bg-card p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">{title}</h2>
                <button
                    type="button"
                    onClick={clearFilters}
                    className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors font-medium"
                >
                    Clear Filters
                </button>
            </div>
            <div className="space-y-4">
                <div
                    className={`grid grid-cols-1 gap-4 ${hideSearch ? "md:grid-cols-2" : "md:grid-cols-3"}`}
                >
                    {!hideSearch && (
                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Search Products
                            </label>
                            <input
                                type="text"
                                value={skuFilter}
                                onChange={(e) => setSkuFilter(e.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="Search by SKU or name..."
                            />
                        </div>
                    )}

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
                                                <div className={groupHeaderClass}>
                                                    {group}
                                                </div>
                                                {dateRangeOptions
                                                    .filter(
                                                        (opt) =>
                                                            opt.group === group
                                                    )
                                                    .map((option) => (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() =>
                                                                handleDateRangeSelect(
                                                                    {
                                                                        kind: "preset",
                                                                        preset: option.value,
                                                                    }
                                                                )
                                                            }
                                                            className={optionClass(
                                                                dateRange.kind ===
                                                                    "preset" &&
                                                                    dateRange.preset ===
                                                                        option.value
                                                            )}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                            </div>
                                        ))}
                                        <div>
                                            <div className={groupHeaderClass}>
                                                Month
                                            </div>
                                            {monthKeys.map((month) => (
                                                <button
                                                    key={month}
                                                    type="button"
                                                    onClick={() =>
                                                        handleDateRangeSelect({
                                                            kind: "month",
                                                            month,
                                                        })
                                                    }
                                                    className={optionClass(
                                                        dateRange.kind ===
                                                            "month" &&
                                                            dateRange.month ===
                                                                month
                                                    )}
                                                >
                                                    {formatMonthKey(month)}
                                                </button>
                                            ))}
                                        </div>
                                        <div>
                                            <div className={groupHeaderClass}>
                                                Custom
                                            </div>
                                            <button
                                                type="button"
                                                onClick={startCustomRange}
                                                className={optionClass(
                                                    dateRange.kind === "custom"
                                                )}
                                            >
                                                Custom Range…
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        <div
                            role="group"
                            aria-label="Count orders by"
                            className="mt-2 flex flex-wrap items-center gap-1 text-xs"
                        >
                            <span className="mr-1 text-muted-foreground">
                                Count orders by
                            </span>
                            {(
                                [
                                    ["orderDate", "Order date"],
                                    ["fulfillmentDate", "Fulfillment date"],
                                ] as const
                            ).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={dateField === value}
                                    onClick={() => setDateField(value)}
                                    className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                                        dateField === value
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        {dateRange.kind === "custom" && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <label className="text-xs text-muted-foreground">
                                    From
                                    <input
                                        type="date"
                                        value={dateRange.start}
                                        max={dateRange.end || undefined}
                                        onChange={(e) =>
                                            setDateRange({
                                                ...dateRange,
                                                start: e.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </label>
                                <label className="text-xs text-muted-foreground">
                                    To
                                    <input
                                        type="date"
                                        value={dateRange.end}
                                        min={dateRange.start || undefined}
                                        onChange={(e) =>
                                            setDateRange({
                                                ...dateRange,
                                                end: e.target.value,
                                            })
                                        }
                                        className={inputClass}
                                    />
                                </label>
                            </div>
                        )}
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
