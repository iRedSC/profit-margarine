import { useEffect, useMemo, useState } from "react";
import { DateRangeType, getDateRange } from "../lib/dateRangeUtils";

export function useProductFilters(defaultRange: DateRangeType) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [marketplaceFilters, setMarketplaceFilters] = useState<Set<string>>(
    new Set()
  );
  const [dateRangeType, setDateRange] = useState<DateRangeType>(defaultRange);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const { start: dateRangeStart, end: dateRangeEnd } = useMemo(
    () => getDateRange(dateRangeType),
    [dateRangeType]
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
    setDateRange(defaultRange);
  };

  return {
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
  };
}
