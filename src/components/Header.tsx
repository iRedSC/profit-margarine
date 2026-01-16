import { Authenticated, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignOutButton } from "../SignOutButton";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import profitFinderLogo from "../../profit_finder_logo.png";

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
            await syncAmazonOrders({ updateExisting });
            await syncEbayOrders({ updateExisting });
            await syncShopifyOrders({ updateExisting });
            toast.success(
                updateExisting
                    ? "Sync & update started for all marketplaces!"
                    : "Sync started for all marketplaces!"
            );
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
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
            <div className="flex items-center gap-3">
                <img 
                    src={profitFinderLogo} 
                    alt="Profit Finder Logo" 
                    className="h-8 w-8"
                />
                <h2 className="text-xl font-semibold text-primary">
                    Profit Finder
                </h2>
            </div>
            <Authenticated>
                <div className="flex items-center gap-4">
                    {activeSyncs.length > 0 && (
                        <div className="text-sm text-gray-600 min-w-[300px] text-right">
                            {activeSyncs.map((sync) => {
                                const marketplaceName = sync.marketplace.charAt(0).toUpperCase() + sync.marketplace.slice(1);
                                const progress = sync.total > 0 
                                    ? `${sync.complete}/${sync.total}` 
                                    : sync.message || "Starting...";
                                return (
                                    <div key={sync._id} className="text-blue-600 font-medium">
                                        {marketplaceName}: {progress}
                                        {sync.message && sync.total === 0 && (
                                            <span className="text-gray-500 ml-2">({sync.message})</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="relative">
                        <button
                            onClick={() => {
                                void handleSyncAll(false);
                            }}
                            onContextMenu={handleContextMenu}
                            disabled={isSyncing}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSyncing ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    Syncing...
                                </>
                            ) : (
                                "Sync All"
                            )}
                        </button>
                        {contextMenu && (
                            <div
                                className="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50 min-w-[160px]"
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
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                                >
                                    Sync & Update All
                                </button>
                                <button
                                    onClick={() => {
                                        void handleSyncOneYear();
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
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
                    <button
                        onClick={handleImportClick}
                        disabled={isImporting}
                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isImporting ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                Importing...
                            </>
                        ) : (
                            "Import Costs"
                        )}
                    </button>

                    <SignOutButton />
                </div>
            </Authenticated>
        </header>
    );
}
