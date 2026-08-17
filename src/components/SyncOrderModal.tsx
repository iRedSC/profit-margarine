import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "./ui/sheet";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "../lib/errors";

type Marketplace = "Amazon" | "Ebay" | "Shopify" | "TikTok";

const marketplacePlaceholders: Record<Marketplace, string> = {
    Amazon: "e.g., 123-1234567-1234567",
    Ebay: "e.g., 12-12345-12345",
    Shopify: "e.g., 1234567890123 or gid://shopify/Order/1234567890123",
    TikTok: "e.g., 1234567890123456789",
};

type SyncOrderModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function SyncOrderModal({ open, onOpenChange }: SyncOrderModalProps) {
    const [marketplace, setMarketplace] = useState<Marketplace>("Amazon");
    const [orderId, setOrderId] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const syncOrderById = useMutation(api.products.syncOrderById);

    const handleSync = async () => {
        if (!orderId.trim()) {
            toast.error("Please enter an order ID");
            return;
        }

        setIsSyncing(true);
        try {
            await syncOrderById({
                marketplace,
                orderId: orderId.trim(),
            });
            toast.success(`Successfully started syncing ${marketplace} order: ${orderId.trim()}`);
            setOrderId("");
            onOpenChange(false);
        } catch (error: unknown) {
            toast.error(`Failed to sync order: ${getErrorMessage(error)}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleClose = () => {
        if (!isSyncing) {
            setOrderId("");
            onOpenChange(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={handleClose}>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Sync Specific Order</SheetTitle>
                    <SheetDescription>
                        Enter the marketplace and order ID to sync a specific order.
                    </SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Marketplace
                        </label>
                        <select
                            value={marketplace}
                            onChange={(e) =>
                                setMarketplace(e.target.value as Marketplace)
                            }
                            disabled={isSyncing}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="Amazon">Amazon</option>
                            <option value="Ebay">eBay</option>
                            <option value="Shopify">Shopify</option>
                            <option value="TikTok">TikTok</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Order ID
                        </label>
                        <Input
                            type="text"
                            value={orderId}
                            onChange={(e) => setOrderId(e.target.value)}
                            placeholder={marketplacePlaceholders[marketplace]}
                            disabled={isSyncing}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !isSyncing) {
                                    void handleSync();
                                }
                            }}
                        />
                        <p className="text-xs text-muted-foreground">
                            Format: {marketplacePlaceholders[marketplace]}
                        </p>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={isSyncing}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={() => void handleSync()}
                            disabled={isSyncing || !orderId.trim()}
                        >
                            {isSyncing ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Syncing...
                                </>
                            ) : (
                                "Sync Order"
                            )}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
