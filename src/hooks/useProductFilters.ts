import { useEffect, useMemo, useState } from "react";
import {
  DateRangeSelection,
  DateRangeType,
  resolveDateRange,
} from "../lib/dateRangeUtils";
import type { ProductDateField } from "../lib/productListUtils";

export function useProductFilters(
  defaultRange: DateRangeType,
  defaultDateField: ProductDateField
) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [marketplaceFilters, setMarketplaceFilters] = useState<Set<string>>(
    new Set()
  );
  const [dateField, setDateField] =
    useState<ProductDateField>(defaultDateField);
  const [dateRange, setDateRange] = useState<DateRangeSelection>({
    kind: "preset",
    preset: defaultRange,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const { start: dateRangeStart, end: dateRangeEnd } = useMemo(
    () => resolveDateRange(dateRange),
    [dateRange]
  );

  const toggleMarketplaceFilter = (marketplace: string) => {
    const next = new Set(marketplaceFilters);
    if (next.has(marketplace)) {
      next.delete(marketplace);
    } else {
      next.add(marketplace);
    }
    setMarketplaceFilters(next);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setMarketplaceFilters(new Set());
    setDateRange({ kind: "preset", preset: defaultRange });
    setDateField(defaultDateField);
  };

  return {
    searchInput,
    setSearchInput,
    search,
    marketplaceFilters,
    toggleMarketplaceFilter,
    dateRange,
    setDateRange,
    dateRangeStart,
    dateRangeEnd,
    dateField,
    setDateField,
    clearFilters,
  };
}
