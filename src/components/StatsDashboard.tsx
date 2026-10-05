import { useProducts } from "../hooks/useProducts";
import { useCallback, useMemo, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ProductFilters } from "./ProductFilters";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useProductFilters } from "../hooks/useProductFilters";
import {
  isOneOf,
  isSubsetOf,
  usePersistentState,
} from "../hooks/usePersistentState";
import {
  filterProducts,
  productDate,
} from "../lib/productListUtils";
import { formatCurrency } from "../lib/productUtils";
import {
  formatRangeLabel,
  previousPeriod,
  toDayKey,
  type DateRangeSelection,
} from "../lib/dateRangeUtils";
import {
  autoGranularity,
  buildItemRankings,
  buildMarketplaceStats,
  buildPeriodStats,
  ChartGranularity,
  enrichProducts,
  granularityLabel,
  summarize,
  type ItemSort,
  type PeriodStats,
  type StatsSummary,
} from "../lib/statsUtils";

// Categorical slots from a palette validated for color-vision deficiency.
// Each metric keeps its color everywhere on the page.
const MONEY_SERIES = [
  { key: "profit", label: "Profit", color: "#2a78d6" },
  { key: "revenue", label: "Revenue", color: "#eb6834" },
  { key: "cost", label: "Product cost", color: "#1baf7a" },
  { key: "fees", label: "Fees", color: "#eda100" },
  { key: "shipping", label: "Net shipping", color: "#e87ba4" },
] as const;
type MoneySeries = (typeof MONEY_SERIES)[number]["key"];
const MONEY_SERIES_KEYS = MONEY_SERIES.map((series) => series.key);
const MARGIN_COLOR = "#4a3aa7";

const GRANULARITY_OPTIONS = ["auto", "hour", "day", "week", "month"] as const;
type GranularityChoice = (typeof GRANULARITY_OPTIONS)[number];

const TREND_MODES = ["amounts", "margin"] as const;
type TrendMode = (typeof TREND_MODES)[number];

const ITEM_SORTS: Array<{ value: ItemSort; label: string }> = [
  { value: "units", label: "Most units" },
  { value: "revenue", label: "Most revenue" },
  { value: "profit", label: "Most profit" },
  { value: "leastProfit", label: "Least profit" },
  { value: "lossOrders", label: "Most losing orders" },
];
const ITEM_SORT_KEYS = ITEM_SORTS.map((option) => option.value);
const ITEM_LIMITS = ["10", "25", "50"] as const;

function money(value: number) {
  return `${value < 0 ? "-" : ""}$${formatCurrency(Math.abs(value))}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ChipGroup<T extends string>({
  options,
  isActive,
  onSelect,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  isActive: (value: T) => boolean;
  onSelect: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={isActive(option.value)}
          onClick={() => onSelect(option.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            isActive(option.value)
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ChangeBadge({
  current,
  previous,
  unit,
}: {
  current: number;
  previous: number | undefined;
  unit: "percent" | "points";
}) {
  if (previous === undefined) return null;
  if (unit === "percent" && previous === 0) {
    return <span className="text-xs text-muted-foreground">no prior data</span>;
  }
  const change =
    unit === "points"
      ? current - previous
      : ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(change) < 0.05) {
    return <span className="text-xs text-muted-foreground">no change</span>;
  }
  const up = change > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-success" : "text-destructive"
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {up ? "+" : ""}
      {change.toFixed(1)}
      {unit === "points" ? " pts" : "%"}
    </span>
  );
}

function StatTile({
  label,
  value,
  valueClassName = "",
  change,
  hint,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  change: ReactNode;
  hint: string;
}) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-4">
        <CardDescription title={hint}>{label}</CardDescription>
        <CardTitle className={`text-2xl ${valueClassName}`}>{value}</CardTitle>
        <div className="min-h-4">{change}</div>
      </CardHeader>
    </Card>
  );
}

function SummaryTiles({
  summary,
  previous,
}: {
  summary: StatsSummary;
  previous: StatsSummary | undefined;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Revenue"
        hint="What buyers paid for the items, before costs."
        value={money(summary.revenue)}
        change={
          <ChangeBadge
            current={summary.revenue}
            previous={previous?.revenue}
            unit="percent"
          />
        }
      />
      <StatTile
        label="Profit"
        hint="Revenue minus product cost, marketplace fees and net shipping."
        value={money(summary.profit)}
        valueClassName={summary.profit < 0 ? "text-destructive" : "text-success"}
        change={
          <ChangeBadge
            current={summary.profit}
            previous={previous?.profit}
            unit="percent"
          />
        }
      />
      <StatTile
        label="Margin"
        hint="Profit as a share of revenue."
        value={`${summary.margin.toFixed(1)}%`}
        valueClassName={summary.margin < 0 ? "text-destructive" : ""}
        change={
          <ChangeBadge
            current={summary.margin}
            previous={previous?.margin}
            unit="points"
          />
        }
      />
      <StatTile
        label="Orders"
        hint="Order lines counted in the totals, and how many lost money."
        value={
          <>
            {summary.orders}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · {summary.lossCount} at a loss
            </span>
          </>
        }
        change={
          <ChangeBadge
            current={summary.orders}
            previous={previous?.orders}
            unit="percent"
          />
        }
      />
    </div>
  );
}

function RevenueBreakdown({ summary }: { summary: StatsSummary }) {
  const parts = MONEY_SERIES.filter((series) => series.key !== "revenue");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Where Revenue Goes</CardTitle>
        <CardDescription>
          Each dollar of {money(summary.revenue)} revenue, split into costs and
          what's left as profit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.revenue <= 0 ? (
          <ChartEmptyState message="No revenue in this range." />
        ) : (
          <div className="space-y-4">
            {parts.map((part) => {
              const amount = summary[part.key];
              const share = (amount / summary.revenue) * 100;
              return (
                <div key={part.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: part.color }}
                        aria-hidden
                      />
                      {part.label}
                    </span>
                    <span
                      className={`tabular-nums ${
                        amount < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {money(amount)}{" "}
                      <span className="text-muted-foreground">
                        ({share.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(Math.max(share, 0), 100)}%`,
                        backgroundColor: part.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendChart({
  data,
  granularity,
  mode,
  onModeChange,
  visibleSeries,
  onToggleSeries,
}: {
  data: PeriodStats[];
  granularity: ChartGranularity;
  mode: TrendMode;
  onModeChange: (mode: TrendMode) => void;
  visibleSeries: MoneySeries[];
  onToggleSeries: (series: MoneySeries) => void;
}) {
  const lines =
    mode === "margin"
      ? [{ key: "margin", label: "Margin", color: MARGIN_COLOR }]
      : MONEY_SERIES.filter((series) => visibleSeries.includes(series.key));
  const format = (value: number) =>
    mode === "margin" ? `${value.toFixed(1)}%` : money(value);

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Over Time</CardTitle>
            <CardDescription>
              {mode === "margin"
                ? `Profit as a share of revenue, per ${granularityLabel(granularity)}.`
                : `Totals per ${granularityLabel(granularity)}. Pick which amounts to show.`}
            </CardDescription>
          </div>
          <ChipGroup
            label="Chart mode"
            options={[
              { value: "amounts", label: "Amounts" },
              { value: "margin", label: "Margin %" },
            ]}
            isActive={(value) => value === mode}
            onSelect={onModeChange}
          />
        </div>
        {mode === "amounts" && (
          <ChipGroup
            label="Amounts shown"
            options={MONEY_SERIES.map((series) => ({
              value: series.key,
              label: series.label,
            }))}
            isActive={(value) => visibleSeries.includes(value)}
            onSelect={onToggleSeries}
          />
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState message="No orders in this range." />
        ) : lines.length === 0 ? (
          <ChartEmptyState message="Pick at least one amount to chart." />
        ) : (
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid vertical={false} className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={64}
                  tickFormatter={(value: number) =>
                    mode === "margin" ? `${value}%` : `$${value}`
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    format(value),
                    name,
                  ]}
                  labelFormatter={(label, payload) => {
                    const orders = payload?.[0]?.payload?.orderCount ?? 0;
                    return `${label} · ${orders} order${orders === 1 ? "" : "s"}`;
                  }}
                />
                {lines.length > 1 && <Legend />}
                {lines.map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.label}
                    stroke={line.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MarketplaceChart({
  data,
}: {
  data: ReturnType<typeof buildMarketplaceStats>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profit by Marketplace</CardTitle>
        <CardDescription>
          Where profit (and losses) are concentrating
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState message="No marketplace profit data for this range." />
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid vertical={false} className="stroke-border" />
                <XAxis dataKey="marketplace" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={64}
                  tickFormatter={(value: number) => `$${value}`}
                />
                <Tooltip
                  formatter={(value: number) => [money(value), "Profit"]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    if (!row) return label;
                    return `${label} · ${row.orderCount} orders · ${row.lossCount} at a loss`;
                  }}
                />
                <Bar
                  dataKey="profit"
                  name="Profit"
                  fill={MONEY_SERIES[0].color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={64}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The date range a breakdown row covers, so clicking it can filter to it. */
function periodSelection(
  row: PeriodStats,
  granularity: ChartGranularity
): DateRangeSelection | null {
  if (granularity === "month") return { kind: "month", month: row.key };
  if (granularity === "day") {
    return { kind: "custom", start: row.key, end: row.key };
  }
  if (granularity === "week") {
    const [year, month, day] = row.key.split("-").map(Number);
    return {
      kind: "custom",
      start: row.key,
      end: toDayKey(new Date(year, month - 1, day + 6)),
    };
  }
  return null;
}

function PeriodBreakdownTable({
  rows,
  granularity,
  onSelectPeriod,
}: {
  rows: PeriodStats[];
  granularity: ChartGranularity;
  onSelectPeriod: (selection: DateRangeSelection) => void;
}) {
  const clickable = granularity !== "hour";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Breakdown by {capitalize(granularityLabel(granularity))}</CardTitle>
        <CardDescription>
          The numbers behind the chart, newest first.
          {clickable &&
            ` Click a ${granularityLabel(granularity)} to filter to it.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <ChartEmptyState message="No orders in this range." />
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">
                    {capitalize(granularityLabel(granularity))}
                  </th>
                  <th className="pb-2 pr-3 font-medium text-right">Orders</th>
                  {MONEY_SERIES.map((series) => (
                    <th
                      key={series.key}
                      className="pb-2 pr-3 font-medium text-right"
                    >
                      {series.label}
                    </th>
                  ))}
                  <th className="pb-2 font-medium text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selection = periodSelection(row, granularity);
                  return (
                    <tr
                      key={row.key}
                      onClick={
                        selection ? () => onSelectPeriod(selection) : undefined
                      }
                      className={`border-b last:border-0 ${
                        selection ? "cursor-pointer hover:bg-muted/50" : ""
                      } ${row.orderCount === 0 ? "text-muted-foreground" : ""}`}
                    >
                      <td className="py-2.5 pr-3 font-medium">{row.label}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {row.orderCount}
                      </td>
                      {MONEY_SERIES.map((series) => (
                        <td
                          key={series.key}
                          className={`py-2.5 pr-3 text-right tabular-nums ${
                            series.key === "profit"
                              ? `font-medium ${
                                  row.profit < 0
                                    ? "text-destructive"
                                    : row.orderCount > 0
                                      ? "text-success"
                                      : ""
                                }`
                              : ""
                          }`}
                        >
                          {money(row[series.key])}
                        </td>
                      ))}
                      <td
                        className={`py-2.5 text-right tabular-nums ${
                          row.margin < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {row.margin.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ItemsTable({
  rows,
  sort,
  onSortChange,
  limit,
  onLimitChange,
}: {
  rows: ReturnType<typeof buildItemRankings>;
  sort: ItemSort;
  onSortChange: (sort: ItemSort) => void;
  limit: (typeof ITEM_LIMITS)[number];
  onLimitChange: (limit: (typeof ITEM_LIMITS)[number]) => void;
}) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>Items</CardTitle>
            <CardDescription>
              Every order line for an item in this range, added up.
            </CardDescription>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Show
            <select
              value={limit}
              onChange={(e) =>
                onLimitChange(e.target.value as (typeof ITEM_LIMITS)[number])
              }
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            >
              {ITEM_LIMITS.map((option) => (
                <option key={option} value={option}>
                  Top {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ChipGroup
          label="Sort items"
          options={ITEM_SORTS}
          isActive={(value) => value === sort}
          onSelect={onSortChange}
        />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <ChartEmptyState
            message={
              sort === "lossOrders"
                ? "No items lost money in this range."
                : "No items sold in this range."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">Item</th>
                  <th className="pb-2 pr-3 font-medium text-right">Units</th>
                  <th className="pb-2 pr-3 font-medium text-right">Revenue</th>
                  <th className="pb-2 pr-3 font-medium text-right">Profit</th>
                  <th className="pb-2 pr-3 font-medium text-right">Margin</th>
                  <th className="pb-2 font-medium text-right">At a loss</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="py-2.5 pr-3 text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="font-medium leading-tight">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.sku}</div>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {row.unitsSold}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {money(row.revenue)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right tabular-nums font-medium ${
                        row.profit < 0 ? "text-destructive" : "text-success"
                      }`}
                    >
                      {money(row.profit)}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right tabular-nums ${
                        row.margin < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {row.margin.toFixed(1)}%
                    </td>
                    <td
                      className={`py-2.5 text-right tabular-nums ${
                        row.lossCount > 0 ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {row.lossCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatsDashboard() {
  const productsQuery = useProducts();
  const products = useMemo(() => productsQuery ?? [], [productsQuery]);
  const productsLoading = productsQuery === undefined;

  const {
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
  } = useProductFilters("last30Days", "orderDate");

  const [granularityChoice, setGranularityChoice] = usePersistentState<GranularityChoice>(
    "stats.granularity",
    "auto",
    isOneOf(GRANULARITY_OPTIONS)
  );
  const [trendMode, setTrendMode] = usePersistentState<TrendMode>(
    "stats.trendMode",
    "amounts",
    isOneOf(TREND_MODES)
  );
  const [visibleSeries, setVisibleSeries] = usePersistentState<MoneySeries[]>(
    "stats.series",
    ["profit", "revenue"],
    isSubsetOf(MONEY_SERIES_KEYS)
  );
  const [itemSort, setItemSort] = usePersistentState<ItemSort>(
    "stats.itemSort",
    "units",
    isOneOf(ITEM_SORT_KEYS)
  );
  const [itemLimit, setItemLimit] = usePersistentState<(typeof ITEM_LIMITS)[number]>(
    "stats.itemLimit",
    "10",
    isOneOf(ITEM_LIMITS)
  );

  const toggleSeries = (series: MoneySeries) =>
    setVisibleSeries((current) =>
      current.includes(series)
        ? current.filter((key) => key !== series)
        : MONEY_SERIES_KEYS.filter(
            (key) => key === series || current.includes(key)
          )
    );

  const filterFor = useCallback(
    (start: number | null, end: number | null) =>
      enrichProducts(
        filterProducts(products, {
          search,
          marketplaces: marketplaceFilters,
          start,
          end,
          dateField,
        })
      ),
    [products, search, marketplaceFilters, dateField]
  );

  const enriched = useMemo(
    () => filterFor(dateRangeStart, dateRangeEnd),
    [filterFor, dateRangeStart, dateRangeEnd]
  );

  const comparison = useMemo(
    () => previousPeriod(dateRangeStart, dateRangeEnd),
    [dateRangeStart, dateRangeEnd]
  );
  const previousSummary = useMemo(
    () =>
      comparison ? summarize(filterFor(comparison.start, comparison.end)) : undefined,
    [filterFor, comparison]
  );

  const granularity = useMemo<ChartGranularity>(() => {
    if (granularityChoice !== "auto") return granularityChoice;
    if (enriched.length === 0) return "day";
    let earliest = Infinity;
    for (const product of enriched) {
      earliest = Math.min(earliest, productDate(product, dateField));
    }
    const start = dateRangeStart ?? earliest;
    const end = Math.min(dateRangeEnd ?? Date.now(), Date.now());
    return autoGranularity(start, Math.max(end, start));
  }, [granularityChoice, enriched, dateField, dateRangeStart, dateRangeEnd]);

  const summary = useMemo(() => summarize(enriched), [enriched]);
  const periodStats = useMemo(
    () => buildPeriodStats(enriched, granularity, dateField),
    [enriched, granularity, dateField]
  );
  const newestFirst = useMemo(() => [...periodStats].reverse(), [periodStats]);
  const marketplaceStats = useMemo(
    () => buildMarketplaceStats(enriched),
    [enriched]
  );
  const items = useMemo(
    () => buildItemRankings(enriched, itemSort, Number(itemLimit)),
    [enriched, itemSort, itemLimit]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Stats</h2>
        <p className="text-muted-foreground">
          How much you made, where it went, and which items drove it.
        </p>
      </div>

      <ProductFilters
        skuFilter={searchInput}
        setSkuFilter={setSearchInput}
        marketplaceFilters={marketplaceFilters}
        toggleMarketplaceFilter={toggleMarketplaceFilter}
        dateRange={dateRange}
        setDateRange={setDateRange}
        dateField={dateField}
        setDateField={setDateField}
        clearFilters={clearFilters}
        title="Filter Stats"
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Group by</span>
          <ChipGroup
            label="Group by"
            options={GRANULARITY_OPTIONS.map((value) => ({
              value,
              label:
                value === "auto"
                  ? `Auto (${granularityLabel(granularity)})`
                  : capitalize(value),
            }))}
            isActive={(value) => value === granularityChoice}
            onSelect={setGranularityChoice}
          />
        </div>
      </div>

      {productsLoading ? (
        <div className="flex justify-center items-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <SummaryTiles summary={summary} previous={previousSummary} />
            <p className="text-xs text-muted-foreground">
              {comparison
                ? `Changes compare with ${formatRangeLabel(comparison.start, comparison.end)}. `
                : ""}
              Profit is revenue minus product cost, marketplace fees and net
              shipping.
              {summary.excludedCount > 0 &&
                ` ${summary.excludedCount} order line${
                  summary.excludedCount === 1 ? " is" : "s are"
                } left out of every number here because ${
                  summary.excludedCount === 1 ? "it has" : "they have"
                } no product cost yet or only estimated shipping.`}
            </p>
          </div>

          <TrendChart
            data={periodStats}
            granularity={granularity}
            mode={trendMode}
            onModeChange={setTrendMode}
            visibleSeries={visibleSeries}
            onToggleSeries={toggleSeries}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <RevenueBreakdown summary={summary} />
            <MarketplaceChart data={marketplaceStats} />
          </div>

          <PeriodBreakdownTable
            rows={newestFirst}
            granularity={granularity}
            onSelectPeriod={setDateRange}
          />

          <ItemsTable
            rows={items}
            sort={itemSort}
            onSortChange={setItemSort}
            limit={itemLimit}
            onLimitChange={setItemLimit}
          />
        </>
      )}
    </div>
  );
}
