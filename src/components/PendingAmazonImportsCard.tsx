import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { AlertCircle, Loader2, RefreshCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function PendingAmazonImportsCard() {
    const pendingImports = useQuery(api.products.listPendingMarketplaceImports);
    const retryPendingAmazonImports = useMutation(
        api.products.retryPendingAmazonImports
    );
    const syncOrderById = useMutation(api.products.syncOrderById);
    const [retryingAll, setRetryingAll] = useState(false);
    const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);

    if (pendingImports === undefined) {
        return null;
    }

    const handleRetryAll = async () => {
        setRetryingAll(true);
        try {
            await retryPendingAmazonImports({});
            toast.success("Pending Amazon retry started.");
        } catch (error: any) {
            toast.error(
                `Failed to retry pending Amazon imports: ${error.message || "Unknown error"}`
            );
        } finally {
            setRetryingAll(false);
        }
    };

    const handleRetryOrder = async (orderId: string) => {
        setRetryingOrderId(orderId);
        try {
            await syncOrderById({
                marketplace: "Amazon",
                orderId,
            });
            toast.success(`Retry started for Amazon order ${orderId}.`);
        } catch (error: any) {
            toast.error(
                `Failed to retry Amazon order ${orderId}: ${error.message || "Unknown error"}`
            );
        } finally {
            setRetryingOrderId(null);
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                    <CardTitle>Pending Amazon Imports</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        Orders hidden from the official list until Amazon posts
                        fulfillment data and exact fees.
                    </p>
                </div>
                <Button
                    onClick={() => void handleRetryAll()}
                    disabled={retryingAll || pendingImports.length === 0}
                    variant="outline"
                >
                    {retryingAll ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Retrying...
                        </>
                    ) : (
                        <>
                            <RefreshCcw className="mr-2 h-4 w-4" />
                            Retry Pending
                        </>
                    )}
                </Button>
            </CardHeader>
            <CardContent>
                {pendingImports.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                        No pending Amazon imports.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Order
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        SKU
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Reason
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Order Date
                                    </th>
                                    <th className="px-3 py-2 text-left font-medium">
                                        Last Attempt
                                    </th>
                                    <th className="px-3 py-2 text-right font-medium">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingImports.map((pendingImport) => (
                                    <tr
                                        key={pendingImport.id}
                                        className="border-t align-top"
                                    >
                                        <td className="px-3 py-2 font-mono text-xs">
                                            {pendingImport.orderId}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium">
                                                {pendingImport.sku}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {pendingImport.name}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-start gap-2">
                                                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
                                                <div>
                                                    <div className="font-medium">
                                                        {pendingImport.reasonCode}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {pendingImport.reasonMessage}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                            {new Date(
                                                pendingImport.orderDate
                                            ).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-xs text-muted-foreground">
                                            {new Date(
                                                pendingImport.lastAttemptAt
                                            ).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    void handleRetryOrder(
                                                        pendingImport.orderId
                                                    )
                                                }
                                                disabled={
                                                    retryingOrderId ===
                                                    pendingImport.orderId
                                                }
                                            >
                                                {retryingOrderId ===
                                                pendingImport.orderId ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    "Retry Order"
                                                )}
                                            </Button>
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
