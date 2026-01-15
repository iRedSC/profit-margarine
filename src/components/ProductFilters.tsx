type ProductFiltersProps = {
  skuFilter: string;
  setSkuFilter: (value: string) => void;
  marketplaceFilters: Set<string>;
  toggleMarketplaceFilter: (marketplace: string) => void;
  dateRangeStart: number | null;
  dateRangeEnd: number | null;
  setDateRange: (days: number | null) => void;
  clearFilters: () => void;
};

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
  const isDateRangeActive = (days: number) => {
    if (dateRangeStart === null || dateRangeEnd === null) return false;
    const range = days * 24 * 60 * 60 * 1000;
    const diff = dateRangeEnd - dateRangeStart;
    return diff <= range + 1000 && diff >= range - 1000;
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
        
          <div className="md:col-span-2">
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDateRange(1)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                isDateRangeActive(1)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Last 24 Hours
            </button>
            <button
              type="button"
              onClick={() => setDateRange(7)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                isDateRangeActive(7)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => setDateRange(30)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                isDateRangeActive(30)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => setDateRange(90)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                isDateRangeActive(90)
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Last 3 Months
            </button>
            <button
              type="button"
              onClick={() => setDateRange(null)}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                dateRangeStart === null
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All Time
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}