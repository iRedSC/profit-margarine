import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useMemo, useState } from "react";
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
import { filterProducts } from "../lib/productListUtils";
import { formatCurrency } from "../lib/productUtils";
import {
  buildMarketplaceStats,
  buildPeriodStats,
  buildTopLossItems,
  buildTopSoldItems,
  ChartGranularity,
  enrichProducts,
  granularityAdjective,
  granularityLabel,
  type PeriodStats,
} from "../lib/statsUtils";

const GRANULARITY_OPTIONS: Array<{ value: ChartGranularity; label: string }> = [
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
];

const CHART_COLORS = {
  profit: "hsl(142 76% 36%)",
  revenue: "hsl(217 91% 60%)",
  cost: "hsl(215 16% 47%)",
  margin: "hsl(38 92% 45%)",
  marketplace: "hsl(222 47% 25%)",
};

function currencyTooltipValue(value: number) {
  return `$${formatCurrency(value)}`;
}

function currencyTick(value: number) {
  return `$${value}`;
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ChartGranularityToggle({
  value,
  onChange,
}: {
  value: ChartGranularity;
  onChange: (value: ChartGranularity) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {GRANULARITY_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === option.value
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

type PeriodLine = {
  dataKey: "profit" | "revenue" | "cost" | "margin";
  stroke: string;
  name?: string;
  activeDot?: { r: number };
};

type PeriodLineChartProps = {
  title: string;
  description: string;
  granularity: ChartGranularity;
  onGranularityChange: (value: ChartGranularity) => void;
  data: PeriodStats[];
  emptyMessage: string;
  yTickFormatter: (value: number) => string;
  tooltipFormatter: (value: number, name: string) => [string, string];
  showLegend?: boolean;
  lines: PeriodLine[];
};

function PeriodChartHeader({
  title,
  description,
  granularity,
  onGranularityChange,
}: Pick<
  PeriodLineChartProps,
  "title" | "description" | "granularity" | "onGranularityChange"
>) {
  return (
    <CardHeader className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <ChartGranularityToggle
          value={granularity}
          onChange={onGranularityChange}
        />
      </div>
    </CardHeader>
  );
}

function PeriodLineChart({
  title,
  description,
  granularity,
  onGranularityChange,
  data,
  emptyMessage,
  yTickFormatter,
  tooltipFormatter,
  showLegend = false,
  lines,
}: PeriodLineChartProps) {
  return (
    <Card>
      <PeriodChartHeader
        title={title}
        description={description}
        granularity={granularity}
        onGranularityChange={onGranularityChange}
      />
      <CardContent>
        {data.length === 0 ? (
          <ChartEmptyState message={emptyMessage} />
        ) : (
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={yTickFormatter} />
                <Tooltip formatter={tooltipFormatter} />
                {showLegend && <Legend />}
                {lines.map((line) => (
                  <Line
                    key={line.dataKey}
                    type="monotone"
                    dataKey={line.dataKey}
                    name={line.name}
                    stroke={line.stroke}
                    strokeWidth={2}
                    dot={false}
                    activeDot={line.activeDot}
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

function RankingTable({
  title,
  description,
  rows,
  emptyMessage,
  mode,
}: {
  title: string;
  description: string;
  rows: ReturnType<typeof buildTopSoldItems>;
  emptyMessage: string;
  mode: "sold" | "loss";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">#</th>
                  <th className="pb-2 pr-3 font-medium">Item</th>
                  {mode === "sold" ? (
                    <>
                      <th className="pb-2 pr-3 font-medium text-right">Units</th>
                      <th className="pb-2 pr-3 font-medium text-right">Revenue</th>
                      <th className="pb-2 font-medium text-right">Profit</th>
                    </>
                  ) : (
                    <>
                      <th className="pb-2 pr-3 font-medium text-right">Losses</th>
                      <th className="pb-2 pr-3 font-medium text-right">Total Loss</th>
                      <th className="pb-2 font-medium text-right">Net Profit</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="py-3 pr-3 text-muted-foreground">{index + 1}</td>
                    <td className="py-3 pr-3">
                      <div className="font-medium leading-tight">{row.name}</div>
                      <div className="text-xs text-muted-foreground">{row.sku}</div>
                    </td>
                    {mode === "sold" ? (
                      <>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          {row.unitsSold}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums">
                          ${formatCurrency(row.revenue)}
                        </td>
                        <td
                          className={`py-3 text-right tabular-nums font-medium ${
                            row.profit < 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          ${formatCurrency(row.profit)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-3 pr-3 text-right tabular-nums font-medium text-destructive">
                          {row.lossCount}
                          {row.lossCount > 1 ? (
                            <span className="ml-1 text-xs font-normal text-destructive/70">
                              orders
                            </span>
                          ) : (
                            <span className="ml-1 text-xs font-normal text-destructive/70">
                              order
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-destructive">
                          ${formatCurrency(row.totalLoss)}
                        </td>
                        <td
                          className={`py-3 text-right tabular-nums font-medium ${
                            row.profit < 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          ${formatCurrency(row.profit)}
                        </td>
                      </>
                    )}
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
  const productsQuery = useQuery(api.products.listProducts);
  const products = useMemo(() => productsQuery ?? [], [productsQuery]);
  const productsLoading = productsQuery === undefined;

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
    clearFilters: resetProductFilters,
  } = useProductFilters("last30Days");
  const [profitGranularity, setProfitGranularity] =
    useState<ChartGranularity>("day");
  const [revenueGranularity, setRevenueGranularity] =
    useState<ChartGranularity>("day");
  const [marginGranularity, setMarginGranularity] =
    useState<ChartGranularity>("day");

  const clearFilters = () => {
    resetProductFilters();
    setProfitGranularity("day");
    setRevenueGranularity("day");
    setMarginGranularity("day");
  };

  const filteredProducts = useMemo(
    () =>
      filterProducts(products, {
        search,
        marketplaces: marketplaceFilters,
        start: dateRangeStart,
        end: dateRangeEnd,
        dateField: "orderDate",
      }),
    [products, search, marketplaceFilters, dateRangeStart, dateRangeEnd]
  );

  const enriched = useMemo(
    () => enrichProducts(filteredProducts),
    [filteredProducts]
  );
  const profitStats = useMemo(
    () => buildPeriodStats(enriched, profitGranularity),
    [enriched, profitGranularity]
  );
  const revenueStats = useMemo(
    () => buildPeriodStats(enriched, revenueGranularity),
    [enriched, revenueGranularity]
  );
  const marginStats = useMemo(
    () => buildPeriodStats(enriched, marginGranularity),
    [enriched, marginGranularity]
  );
  const marketplaceStats = useMemo(
    () => buildMarketplaceStats(enriched),
    [enriched]
  );
  const topSold = useMemo(() => buildTopSoldItems(enriched), [enriched]);
  const topLoss = useMemo(() => buildTopLossItems(enriched), [enriched]);

  const summary = useMemo(() => {
    const withCost = enriched.filter((p) => p.hasCost);
    const revenue = withCost.reduce((sum, p) => sum + p.price, 0);
    const profit = withCost.reduce((sum, p) => sum + p.profit, 0);
    const lossCount = withCost.filter((p) => p.profit < 0).length;
    return {
      revenue,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      orders: enriched.length,
      lossCount,
    };
  }, [enriched]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Stats</h2>
        <p className="text-muted-foreground">
          Profit trends, revenue vs cost, and item rankings for the selected
          period.
        </p>
      </div>

      <ProductFilters
        skuFilter={searchInput}
        setSkuFilter={setSearchInput}
        marketplaceFilters={marketplaceFilters}
        toggleMarketplaceFilter={toggleMarketplaceFilter}
        dateRangeType={dateRangeType}
        setDateRange={setDateRange}
        clearFilters={clearFilters}
        title="Filter Stats"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue</CardDescription>
            <CardTitle className="text-2xl text-info">
              ${formatCurrency(summary.revenue)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Profit</CardDescription>
            <CardTitle
              className={`text-2xl ${
                summary.profit < 0 ? "text-destructive" : "text-success"
              }`}
            >
              ${formatCurrency(summary.profit)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Margin</CardDescription>
            <CardTitle
              className={`text-2xl ${
                summary.margin < 0 ? "text-destructive" : "text-success"
              }`}
            >
              {summary.margin.toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Orders / Losses</CardDescription>
            <CardTitle className="text-2xl">
              {summary.orders}{" "}
              <span className="text-base font-normal text-destructive">
                / {summary.lossCount}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {productsLoading ? (
        <div className="flex justify-center items-center min-h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <PeriodLineChart
              title={`Profit per ${granularityLabel(profitGranularity)}`}
              description={`Net profit by order ${granularityLabel(profitGranularity)} (orders with cost data)`}
              granularity={profitGranularity}
              onGranularityChange={setProfitGranularity}
              data={profitStats}
              emptyMessage={`No ${granularityAdjective(profitGranularity)} profit data for this range.`}
              yTickFormatter={currencyTick}
              tooltipFormatter={(value) => [
                currencyTooltipValue(value),
                "Profit",
              ]}
              lines={[
                {
                  dataKey: "profit",
                  stroke: CHART_COLORS.profit,
                  activeDot: { r: 4 },
                },
              ]}
            />

            <PeriodLineChart
              title={`Revenue vs Cost per ${granularityLabel(revenueGranularity)}`}
              description={`Gross revenue compared to product cost by order ${granularityLabel(revenueGranularity)}`}
              granularity={revenueGranularity}
              onGranularityChange={setRevenueGranularity}
              data={revenueStats}
              emptyMessage="No revenue/cost data for this range."
              yTickFormatter={currencyTick}
              tooltipFormatter={(value, name) => [
                currencyTooltipValue(value),
                name === "revenue" ? "Revenue" : "Cost",
              ]}
              showLegend
              lines={[
                {
                  dataKey: "revenue",
                  name: "Revenue",
                  stroke: CHART_COLORS.revenue,
                },
                {
                  dataKey: "cost",
                  name: "Cost",
                  stroke: CHART_COLORS.cost,
                },
              ]}
            />

            <PeriodLineChart
              title="Margin % Trend"
              description={`Average margin per ${granularityLabel(marginGranularity)} across priced orders`}
              granularity={marginGranularity}
              onGranularityChange={setMarginGranularity}
              data={marginStats}
              emptyMessage="No margin data for this range."
              yTickFormatter={(value) => `${value}%`}
              tooltipFormatter={(value) => [`${value.toFixed(1)}%`, "Margin"]}
              lines={[
                {
                  dataKey: "margin",
                  stroke: CHART_COLORS.margin,
                  activeDot: { r: 4 },
                },
              ]}
            />

            <Card>
              <CardHeader>
                <CardTitle>Profit by Marketplace</CardTitle>
                <CardDescription>
                  Where profit (and losses) are concentrating
                </CardDescription>
              </CardHeader>
              <CardContent>
                {marketplaceStats.length === 0 ? (
                  <ChartEmptyState message="No marketplace profit data for this range." />
                ) : (
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={marketplaceStats}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="marketplace" tick={{ fontSize: 12 }} />
                        <YAxis
                          tick={{ fontSize: 12 }}
                          tickFormatter={(v) => `$${v}`}
                        />
                        <Tooltip
                          formatter={(value: number) => [
                            currencyTooltipValue(value),
                            "Profit",
                          ]}
                          labelFormatter={(label, payload) => {
                            const lossCount =
                              payload?.[0]?.payload?.lossCount ?? 0;
                            return `${label} · ${lossCount} loss order${
                              lossCount === 1 ? "" : "s"
                            }`;
                          }}
                        />
                        <Bar
                          dataKey="profit"
                          name="Profit"
                          fill={CHART_COLORS.marketplace}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <RankingTable
              title="Top Sold Items"
              description="Ranked by units sold in the selected period"
              rows={topSold}
              emptyMessage="No sold items in this range."
              mode="sold"
            />
            <RankingTable
              title="Top Loss Items"
              description="Ranked by number of losing orders, then total loss dollars"
              rows={topLoss}
              emptyMessage="No loss-making items in this range."
              mode="loss"
            />
          </div>
        </>
      )}
    </div>
  );
}
