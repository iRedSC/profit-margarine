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
import { SyncOrderModal } from "./SyncOrderModal";
import {
    IMPORT_CHUNK_SIZE,
    parseDataRowsFromSheet,
    productCostsToExportSheet,
    productRowsToExportSheet,
} from "../lib/dataImportExport";
import { getErrorMessage } from "../lib/errors";

export function Header() {
    const [isSyncing, setIsSyncing] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [importMenuOpen, setImportMenuOpen] = useState(false);
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [isSyncOrderModalOpen, setIsSyncOrderModalOpen] = useState(false);
    const products = useQuery(api.products.listProducts) || [];
    const productCosts = useQuery(api.products.listProductCosts) || [];
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
    const importMarketplaceProducts = useMutation(
        api.importData.importMarketplaceProducts
    );
    const costsFileInputRef = useRef<HTMLInputElement>(null);
    const dataFileInputRef = useRef<HTMLInputElement>(null);
    const importMenuRef = useRef<HTMLDivElement>(null);
    const exportMenuRef = useRef<HTMLDivElement>(null);

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

    useEffect(() => {
        if (!importMenuOpen && !exportMenuOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                importMenuRef.current &&
                !importMenuRef.current.contains(target)
            ) {
                setImportMenuOpen(false);
            }
            if (
                exportMenuRef.current &&
                !exportMenuRef.current.contains(target)
            ) {
                setExportMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () =>
            document.removeEventListener("mousedown", handleClickOutside);
    }, [importMenuOpen, exportMenuOpen]);

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
                await syncAmazonOrders({});
                await syncEbayOrders({ updateExisting });
                await syncShopifyOrders({ updateExisting });
                toast.success("Sync started for all marketplaces!");
            }
        } catch (error: unknown) {
            toast.error(`Sync failed: ${getErrorMessage(error)}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSyncOneYear = async () => {
        setIsSyncing(true);
        setContextMenu(null);
        try {
            await syncAmazonOrdersOneYear({ updateExisting: true });
            await syncEbayOrdersOneYear({});
            await syncShopifyOrdersOneYear({});
            toast.success("1-year sync started for all marketplaces!");
        } catch (error: unknown) {
            toast.error(`1-year sync failed: ${getErrorMessage(error)}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleExportData = () => {
        setExportMenuOpen(false);
        if (products.length === 0) {
            toast.error("No data rows to export");
            return;
        }

        setIsExporting(true);
        try {
            const sheetRows = productRowsToExportSheet(products);
            const worksheet = XLSX.utils.json_to_sheet(sheetRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
            const dateStamp = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(workbook, `profitability-data-${dateStamp}.xlsx`);
            toast.success(`Exported ${products.length} data rows`);
        } catch (error: unknown) {
            toast.error(`Export failed: ${getErrorMessage(error)}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportCosts = () => {
        setExportMenuOpen(false);
        if (productCosts.length === 0) {
            toast.error("No product costs to export");
            return;
        }

        setIsExporting(true);
        try {
            const sheetRows = productCostsToExportSheet(productCosts);
            const worksheet = XLSX.utils.json_to_sheet(sheetRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Costs");
            const dateStamp = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(workbook, `product-costs-${dateStamp}.xlsx`);
            toast.success(`Exported ${productCosts.length} product costs`);
        } catch (error: unknown) {
            toast.error(`Cost export failed: ${getErrorMessage(error)}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleCostsFileUpload = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
                firstSheet
            );

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

            const costProducts = jsonData
                .map((row) => {
                    const skuValue = row[skuHeader];
                    const costValue = row[costHeader];
                    const sku =
                        typeof skuValue === "string" ||
                        typeof skuValue === "number"
                            ? String(skuValue).trim()
                            : "";
                    const cost =
                        typeof costValue === "number"
                            ? costValue
                            : typeof costValue === "string"
                              ? parseFloat(costValue)
                              : Number.NaN;
                    return { sku, cost };
                })
                .filter((p) => p.sku && !isNaN(p.cost));

            if (costProducts.length === 0) {
                toast.error("No valid products found in the file");
                setIsImporting(false);
                return;
            }

            const result = await importProductCosts({ products: costProducts });
            toast.success(
                `Import complete! Updated: ${result.updated}, Created: ${result.created}`
            );
        } catch (error: unknown) {
            toast.error(`Import failed: ${getErrorMessage(error)}`);
        } finally {
            setIsImporting(false);
            if (costsFileInputRef.current) {
                costsFileInputRef.current.value = "";
            }
        }
    };

    const handleDataFileUpload = async (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(
                firstSheet
            );

            const rows = parseDataRowsFromSheet(jsonData);

            if (rows.length === 0) {
                toast.error("No valid data rows found in the file");
                setIsImporting(false);
                return;
            }

            let updated = 0;
            let created = 0;

            for (let i = 0; i < rows.length; i += IMPORT_CHUNK_SIZE) {
                const chunk = rows.slice(i, i + IMPORT_CHUNK_SIZE);
                const result = await importMarketplaceProducts({ rows: chunk });
                updated += result.updated;
                created += result.created;
            }

            toast.success(
                `Data import complete! Updated: ${updated}, Created: ${created}`
            );
        } catch (error: unknown) {
            toast.error(`Data import failed: ${getErrorMessage(error)}`);
        } finally {
            setIsImporting(false);
            if (dataFileInputRef.current) {
                dataFileInputRef.current.value = "";
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
                            onClick={() => {
                                if (activeSyncs.length > 0) {
                                    void cancelAllActiveSyncs({})
                                        .then(() => toast.success("Sync canceled"))
                                        .catch((error: unknown) =>
                                            toast.error(`Failed to cancel sync: ${getErrorMessage(error)}`)
                                        );
                                } else {
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
                                <button
                                    onClick={() => {
                                        setContextMenu(null);
                                        setIsSyncOrderModalOpen(true);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Sync Specific Order
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="relative" ref={exportMenuRef}>
                        <Button
                            onClick={() => {
                                setImportMenuOpen(false);
                                setExportMenuOpen((open) => !open);
                            }}
                            disabled={isExporting || isImporting}
                            variant="outline"
                        >
                            {isExporting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Exporting...
                                </>
                            ) : (
                                "Export"
                            )}
                        </Button>
                        {exportMenuOpen && !isExporting && (
                            <div className="absolute right-0 top-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md py-1 z-50 min-w-[160px]">
                                <button
                                    onClick={handleExportData}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Export Data
                                </button>
                                <button
                                    onClick={handleExportCosts}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Export Costs
                                </button>
                            </div>
                        )}
                    </div>

                    <input
                        ref={costsFileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                            void handleCostsFileUpload(e);
                        }}
                        className="hidden"
                    />
                    <input
                        ref={dataFileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={(e) => {
                            void handleDataFileUpload(e);
                        }}
                        className="hidden"
                    />
                    <div className="relative" ref={importMenuRef}>
                        <Button
                            onClick={() => {
                                setExportMenuOpen(false);
                                setImportMenuOpen((open) => !open);
                            }}
                            disabled={isImporting}
                            variant="default"
                        >
                            {isImporting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                "Import"
                            )}
                        </Button>
                        {importMenuOpen && !isImporting && (
                            <div className="absolute right-0 top-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md py-1 z-50 min-w-[160px]">
                                <button
                                    onClick={() => {
                                        setImportMenuOpen(false);
                                        dataFileInputRef.current?.click();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Import Data
                                </button>
                                <button
                                    onClick={() => {
                                        setImportMenuOpen(false);
                                        costsFileInputRef.current?.click();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                                >
                                    Import Costs
                                </button>
                            </div>
                        )}
                    </div>

                    <SignOutButton />
                </div>
            </Authenticated>
            <SyncOrderModal
                open={isSyncOrderModalOpen}
                onOpenChange={setIsSyncOrderModalOpen}
            />
        </header>
    );
}
