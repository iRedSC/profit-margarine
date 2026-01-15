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
        (p) => p.cost !== undefined
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

    if (filteredProducts.length === 0) {
        return null;
    }

    return (
        <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-2xl font-bold mb-6">Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                    <div className="text-sm font-medium text-blue-700 mb-1">
                        Total Gross
                    </div>
                    <div className="text-2xl font-bold text-blue-900">
                        ${formatCurrency(totalGross)}
                    </div>
                </div>

                <div
                    className={`bg-gradient-to-br rounded-lg p-4 border ${totalProfit >= 0 ? "from-green-50 to-green-100 border-green-200" : "from-red-50 to-red-100 border-red-200"}`}
                >
                    <div
                        className={`text-sm font-medium mb-1 ${totalProfit >= 0 ? "text-green-700" : "text-red-700"}`}
                    >
                        Total Profit
                    </div>
                    <div
                        className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-900" : "text-red-900"}`}
                    >
                        ${formatCurrency(totalProfit)}{" "}
                        <span
                            className={`text-sm font-normal ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                            ({profitPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4 border border-slate-200">
                    <div className="text-sm font-medium text-slate-700 mb-1">
                        Total Cost
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                        ${formatCurrency(totalCost)}{" "}
                        <span className="text-sm font-normal text-slate-600">
                            ({costPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                    <div className="text-sm font-medium text-purple-700 mb-1">
                        Total Fees
                    </div>
                    <div className="text-2xl font-bold text-purple-900">
                        ${formatCurrency(totalFees)}{" "}
                        <span className="text-sm font-normal text-purple-600">
                            ({feesPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                    <div className="text-sm font-medium text-orange-700 mb-1">
                        Total Shipping
                    </div>
                    <div className="text-2xl font-bold text-orange-900">
                        ${formatCurrency(totalShipping)}{" "}
                        <span className="text-sm font-normal text-orange-600">
                            ({shippingPercentage.toFixed(1)}%)
                        </span>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-teal-50 to-teal-100 rounded-lg p-4 border border-teal-200">
                    <div className="text-sm font-medium text-teal-700 mb-1">
                        Average Profit
                    </div>
                    <div
                        className={`text-2xl font-bold ${averageProfit >= 0 ? "text-teal-900" : "text-red-900"}`}
                    >
                        ${formatCurrency(averageProfit)}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg p-4 border border-indigo-200">
                    <div className="text-sm font-medium text-indigo-700 mb-1">
                        Average Margin
                    </div>
                    <div
                        className={`text-2xl font-bold ${averageMargin >= 0 ? "text-indigo-900" : "text-red-900"}`}
                    >
                        {averageMargin.toFixed(1)}%
                    </div>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
                    <div className="text-sm font-medium text-amber-700 mb-1">
                        Rows Without Cost
                    </div>
                    <div className="text-2xl font-bold text-amber-900">
                        {rowsWithoutCost}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                    <div className="text-sm font-medium text-red-700 mb-1">
                        Unprofitable
                    </div>
                    <div className="text-2xl font-bold text-red-900">
                        {unprofitableRows}
                    </div>
                </div>

                <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
                    <div className="text-sm font-medium text-yellow-700 mb-1">
                        Dubious {"(<5% or <$3)"}
                    </div>
                    <div className="text-2xl font-bold text-yellow-900">
                        {barelyProfitableRows}
                    </div>
                </div>
            </div>
        </div>
    );
}
