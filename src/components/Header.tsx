import { Authenticated, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignOutButton } from "../SignOutButton";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";
import { SidebarTrigger } from "./ui/sidebar";
import { Progress } from "./ui/progress";

export function Header() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const activeSyncs = useQuery(api.products.getSyncStatus) || [];
    const syncAmazonOrders = useMutation(api.products.syncAmazonOrders);
    const syncEbayOrders = useMutation(api.products.syncEbayOrders);
    const syncShopifyOrders = useMutation(
        api.shopifyMutations.syncShopifyOrders
    );
    const syncAmazonOrdersOneYear = useMutation(
        api.products.syncAmazonOrdersOneYear
    );
    const syncEbayOrdersOneYear = useMutation(
        api.products.syncEbayOrdersOneYear
    );
    const syncShopifyOrdersOneYear = useMutation(
        api.products.syncShopifyOrdersOneYear
    );
    const resyncAllOrders = useMutation(api.products.resyncAllOrders);
    const cancelAllActiveSyncs = useMutation(api.products.cancelAllActiveSyncs);
    const importProductCosts = useMutation(api.importCosts.importProductCosts);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(null);
        };
        if (contextMenu) {
            document.addEventListener("click", handleClickOutside);
            return () =>
                document.removeEventListener("click", handleClickOutside);
        }
    }, [contextMenu]);

    const handleSyncAll = async (updateExisting: boolean = false) => {
        setIsSyncing(true);
        setContextMenu(null);
        try {
            if (updateExisting) {
                // When updating, resync all existing orders from marketplace products
                await resyncAllOrders({});
                toast.success("Resyncing all orders from existing marketplace products!");
            } else {
                // Normal sync - fetch new orders from APIs
                await syncAmazonOrders({ updateExisting });
                await syncEbayOrders({ updateExisting });
                await syncShopifyOrders({ updateExisting });
                toast.success("Sync started for all marketplaces!");
            }
        } catch (error: any) {
            toast.error(`Sync failed: ${error.message || "Unknown error"}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncOneYear = async () => {
        setIsSyncing(true);
        setContextMenu(null);
        try {
            await syncAmazonOrdersOneYear({});
            await syncEbayOrdersOneYear({});
            await syncShopifyOrdersOneYear({});
            toast.success("1-year sync started for all marketplaces!");
        } catch (error: any) {
            toast.error(
                `1-year sync failed: ${error.message || "Unknown error"}`
            );
        } finally {
            setIsSyncing(false);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            const headers = Object.keys(jsonData[0] || {});
            const skuHeader = headers.find((h) =>
                h.toLowerCase().includes("sku")
            );
            const costHeader = headers.find((h) =>
                h.toLowerCase().includes("cost")
            );

            if (!skuHeader || !costHeader) {
                toast.error(
                    "Could not find 'sku' and 'cost' columns in the file"
                );
                setIsImporting(false);
                return;
            }

            const products = jsonData
                .map((row: any) => ({
                    sku: String(row[skuHeader] || "").trim(),
                    cost: parseFloat(row[costHeader]),
                }))
                .filter((p) => p.sku && !isNaN(p.cost));

            if (products.length === 0) {
                toast.error("No valid products found in the file");
                setIsImporting(false);
                return;
            }

            const result = await importProductCosts({ products });
            toast.success(
                `Import complete! Updated: ${result.updated}, Created: ${result.created}`
            );
        } catch (error: any) {
            toast.error(`Import failed: ${error.message || "Unknown error"}`);
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-16 flex justify-between items-center px-4 lg:px-6">
            <div className="flex items-center gap-2">
                <SidebarTrigger />
            </div>
            <Authenticated>
                <div className="flex items-center gap-4">
                    {activeSyncs.length > 0 && (() => {
                        const totalComplete = activeSyncs.reduce((sum, sync) => sum + sync.complete, 0);
                        const totalItems = activeSyncs.reduce((sum, sync) => sum + sync.total, 0);
                        const marketplaceNames = activeSyncs.map(s => 
                            s.marketplace.charAt(0).toUpperCase() + s.marketplace.slice(1)
                        ).join(", ");
                        const primarySync = activeSyncs[0];
                        
                        const progressValue = totalItems === 0 
                            ? 50 // Indeterminate progress when initializing
                            : Math.min(100, (totalComplete / totalItems) * 100);
                        
                        const statusMessage = activeSyncs.length === 1
                            ? (primarySync.message || `Syncing ${marketplaceNames}...`)
                            : `Syncing ${marketplaceNames}...`;
                        
                        const progressText = totalItems === 0
                            ? "Initializing..."
                            : `${totalComplete} of ${totalItems} items processed`;
                        
                        return (
                            <div className="flex flex-col gap-2 min-w-[300px] max-w-[400px]">
                                <div className="text-sm font-medium text-foreground">
                                    {statusMessage}
                                </div>
                                <Progress 
                                    value={progressValue}
                                    className="h-2"
                                />
                                <div className="text-xs text-muted-foreground text-right">
                                    {progressText}
                                </div>
                            </div>
                        );
                    })()}
                    <div className="relative">
                        <Button
                            onClick={async () => {
                                if (activeSyncs.length > 0) {
                                    // Cancel all active syncs
                                    try {
                                        await cancelAllActiveSyncs({});
                                        toast.success("Sync canceled");
                                    } catch (error: any) {
                                        toast.error(`Failed to cancel sync: ${error.message || "Unknown error"}`);
                                    }
                                } else {
                                    // Start sync
                                    void handleSyncAll(false);
                                }
                            }}
                            onContextMenu={activeSyncs.length === 0 ? handleContextMenu : undefined}
                            disabled={isSyncing && activeSyncs.length === 0}
                            variant={activeSyncs.length > 0 ? "destructive" : "default"}
                        >
                            {activeSyncs.length > 0 ? (
                                <>
                                    Cancel Sync
                                </>
                            ) : isSyncing ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Syncing...
                                </>
                            ) : (
                                "Sync All"
                            )}
                        </Button>
                        {contextMenu && (
                            <div
                                className="fixed rounded-md border bg-popover text-popover-foreground shadow-md py-1 z-50 min-w-[160px]"
                                style={{
                                    left: `${contextMenu.x}px`,
                                    top: `${contextMenu.y}px`,
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => {
                                        void handleSyncAll(true);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Sync & Update All
                                </button>
                                <button
                                    onClick={() => {
                                        void handleSyncOneYear();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Sync 1 year
                                </button>
                            </div>
                        )}
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                            void handleFileUpload(e);
                        }}
                        className="hidden"
                    />
                    <Button
                        onClick={handleImportClick}
                        disabled={isImporting}
                        variant="default"
                    >
                        {isImporting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            "Import Costs"
                        )}
                    </Button>

                    <SignOutButton />
                </div>
            </Authenticated>
        </header>
    );
}
