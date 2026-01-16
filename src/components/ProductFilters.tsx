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

const dateRangeOptions: Array<{ value: DateRangeType; label: string; group: string }> = [
  { value: 'today', label: 'Today', group: 'Current Period' },
  { value: 'thisWeek', label: 'This Week', group: 'Current Period' },
  { value: 'thisMonth', label: 'This Month', group: 'Current Period' },
  { value: 'yesterday', label: 'Yesterday', group: 'Previous Period' },
  { value: 'lastWeek', label: 'Last Week', group: 'Previous Period' },
  { value: 'lastMonth', label: 'Last Month', group: 'Previous Period' },
  { value: 'last24Hours', label: 'Last 24 Hours', group: 'Rolling Periods' },
  { value: 'last7Days', label: 'Last 7 Days', group: 'Rolling Periods' },
  { value: 'last30Days', label: 'Last 30 Days', group: 'Rolling Periods' },
  { value: 'last90Days', label: 'Last 3 Months', group: 'Rolling Periods' },
  { value: 'allTime', label: 'All Time', group: 'Rolling Periods' },
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
    return 'today';
  };

  const currentRange = dateRangeOptions.find(opt => opt.value === getCurrentDateRangeType());
  const currentLabel = currentRange?.label || 'Select date range';

  const handleDateRangeSelect = (rangeType: DateRangeType) => {
    setDateRange(rangeType);
    setIsDropdownOpen(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Filter Products</h2>
        <button
          type="button"
          onClick={clearFilters}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors font-medium"
        >
          Clear Filters
        </button>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search SKU</label>
            <input
              type="text"
              value={skuFilter}
              onChange={(e) => setSkuFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Type to search..."
            />
          </div>
        
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex items-center justify-between"
              >
                <span className="text-gray-700">{currentLabel}</span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${isDropdownOpen ? 'transform rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-auto">
                    {['Current Period', 'Previous Period', 'Rolling Periods'].map((group) => (
                      <div key={group}>
                        <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50 sticky top-0">
                          {group}
                        </div>
                        {dateRangeOptions
                          .filter(opt => opt.group === group)
                          .map((option) => {
                            const isActive = isDateRangeType(dateRangeStart, dateRangeEnd, option.value);
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleDateRangeSelect(option.value)}
                                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                  isActive
                                    ? 'bg-blue-50 text-blue-700 font-medium'
                                    : 'text-gray-700 hover:bg-gray-50'
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Marketplace</label>
            <div className="flex flex-wrap gap-2">
              {["Amazon", "Ebay", "Shopify", "TikTok"].map((marketplace) => (
                <button
                  key={marketplace}
                  type="button"
                  onClick={() => toggleMarketplaceFilter(marketplace)}
                  className={`px-4 py-2 rounded-md font-medium transition-colors ${
                    marketplaceFilters.has(marketplace)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {marketplace}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}