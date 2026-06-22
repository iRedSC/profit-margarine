import {
    calculateProfit,
    calculateMargin,
    formatCurrency,
} from "../lib/productUtils";

type Product = {
    price: number;
    cost: number | undefined;
    fees: number;
    shipping: number;
    buyerPaidShipping: number | undefined;
};

type ProductMetricsProps = {
    filteredProducts: Product[];
};

export function ProductMetrics({ filteredProducts }: ProductMetricsProps) {
    // Calculate net shipping for each product (seller shipping - buyer paid shipping)
    const productsWithNetShipping = filteredProducts.map((p) => ({
        ...p,
        netShipping:
            p.buyerPaidShipping !== undefined
                ? p.shipping - p.buyerPaidShipping
                : p.shipping,
    }));

    const productsWithCost = productsWithNetShipping.filter(
        (p) => p.cost !== undefined && p.shipping !== 0
    );
    const totalGross = productsWithCost.reduce((sum, p) => sum + p.price, 0);
    const totalCost = productsWithCost.reduce(
        (sum, p) => sum + (p.cost || 0),
        0
    );
    const totalFees = productsWithCost.reduce((sum, p) => sum + p.fees, 0);
    const totalShipping = productsWithCost.reduce(
        (sum, p) => sum + p.netShipping,
        0
    );
    const totalProfit = productsWithCost.reduce(
        (sum, p) =>
            sum + calculateProfit(p.price, p.cost, p.fees, p.netShipping),
        0
    );
    const averageProfit =
        productsWithCost.length > 0 ? totalProfit / productsWithCost.length : 0;
    const averageMargin = totalGross > 0 ? (totalProfit / totalGross) * 100 : 0;
    const costPercentage = totalGross > 0 ? (totalCost / totalGross) * 100 : 0;
    const feesPercentage = totalGross > 0 ? (totalFees / totalGross) * 100 : 0;
    const shippingPercentage =
        totalGross > 0 ? (totalShipping / totalGross) * 100 : 0;
    const profitPercentage =
        totalGross > 0 ? (totalProfit / totalGross) * 100 : 0;
    const rowsWithoutCost = filteredProducts.filter(
        (p) => p.cost === undefined
    ).length;
    const unprofitableRows = productsWithCost.filter(
        (p) => calculateProfit(p.price, p.cost, p.fees, p.netShipping) < 0
    ).length;
    const barelyProfitableRows = productsWithCost.filter((p) => {
        const profit = calculateProfit(p.price, p.cost, p.fees, p.netShipping);
        const margin = calculateMargin(p.price, p.cost, p.fees, p.netShipping);
        return profit > 0 && (margin < 5 || profit < 3);
    }).length;
    const totalRows = filteredProducts.length;
    const rowCountSuffix = (count: number) => {
        const percentage = totalRows > 0 ? (count / totalRows) * 100 : 0;
        return `(${percentage.toFixed(1)}% of ${totalRows})`;
    };

    if (filteredProducts.length === 0) {
        return null;
    }

    return (
        <div className="rounded-lg border bg-card p-6">
            <h2 className="text-2xl font-bold mb-6">Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="rounded-lg p-4 border bg-info/5 border-info/30">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Total Gross
                    </div>
                    <div className="text-2xl font-bold text-info">
                        ${formatCurrency(totalGross)}
                    </div>
                </div>

                <div className={`rounded-lg p-4 border ${totalProfit >= 0 ? "bg-success/5 border-success/30" : "bg-destructive/5 border-destructive/30"}`}>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Total Profit
                    </div>
                    <div className={`text-2xl font-bold ${totalProfit < 0 ? "text-destructive" : "text-success"}`}>
                        ${formatCurrency(totalProfit)}{" "}
                        <span className={`text-sm font-normal ${totalProfit < 0 ? "text-destructive/70" : "text-success/70"}`}>
                            ({profitPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className="rounded-lg p-4 border bg-muted/30 border-border">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Total Cost
                    </div>
                    <div className="text-2xl font-bold">
                        ${formatCurrency(totalCost)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                            ({costPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className="rounded-lg p-4 border bg-muted/30 border-border">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Total Fees
                    </div>
                    <div className="text-2xl font-bold">
                        ${formatCurrency(totalFees)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                            ({feesPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className="rounded-lg p-4 border bg-muted/30 border-border">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Total Shipping
                    </div>
                    <div className="text-2xl font-bold">
                        ${formatCurrency(totalShipping)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                            ({shippingPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className={`rounded-lg p-4 border ${averageProfit < 0 ? "bg-destructive/5 border-destructive/30" : averageProfit > 0 ? "bg-success/5 border-success/30" : "bg-muted/30 border-border"}`}>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Average Profit
                    </div>
                    <div className={`text-2xl font-bold ${averageProfit < 0 ? "text-destructive" : averageProfit > 0 ? "text-success" : ""}`}>
                        ${formatCurrency(averageProfit)}
                    </div>
                </div>

                <div className={`rounded-lg p-4 border ${averageMargin < 0 ? "bg-destructive/5 border-destructive/30" : averageMargin > 0 ? "bg-success/5 border-success/30" : "bg-muted/30 border-border"}`}>
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Average Margin
                    </div>
                    <div className={`text-2xl font-bold ${averageMargin < 0 ? "text-destructive" : averageMargin > 0 ? "text-success" : ""}`}>
                        {averageMargin.toFixed(1)}%
                    </div>
                </div>

                <div className="rounded-lg p-4 border bg-info/5 border-info/30">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Rows Without Cost
                    </div>
                    <div className="text-2xl font-bold text-info">
                        {rowsWithoutCost}{" "}
                        <span className="text-sm font-normal text-info/70">
                            {rowCountSuffix(rowsWithoutCost)}
                        </span>
                    </div>
                </div>

                <div className="rounded-lg p-4 border bg-destructive/5 border-destructive/30">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Unprofitable
                    </div>
                    <div className="text-2xl font-bold text-destructive">
                        {unprofitableRows}{" "}
                        <span className="text-sm font-normal text-destructive/70">
                            {rowCountSuffix(unprofitableRows)}
                        </span>
                    </div>
                </div>

                <div className="rounded-lg p-4 border bg-warning/5 border-warning/30">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                        Dubious {"(<5% or <$3)"}
                    </div>
                    <div className="text-2xl font-bold text-warning">
                        {barelyProfitableRows}{" "}
                        <span className="text-sm font-normal text-warning/70">
                            {rowCountSuffix(barelyProfitableRows)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
