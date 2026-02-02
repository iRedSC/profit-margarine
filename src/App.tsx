import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Toaster, toast } from "sonner";
import { Header } from "./components/Header";
import { Content } from "./components/Content";
import { AppSidebar } from "./components/Sidebar";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { useAltDragSelection } from "./hooks/useAltDragSelection";
import { AltDragSelectionOverlay } from "./components/AltDragSelectionOverlay";

export default function App() {
    const [selectedView, setSelectedView] = useState("products");
    const completeEbayOAuth = useMutation(api.ebayMutations.completeOAuthFlow);
    const completeTiktokOAuth = useMutation(api.tiktokMutations.completeOAuthFlow);
    const { selectionBox, copiedState } = useAltDragSelection();

    // Check for OAuth callback success/error
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("shopify_connected") === "true") {
            toast.success("Shopify store connected successfully!");
            // Clean up URL
            window.history.replaceState({}, "", window.location.pathname);
        }

        // Handle eBay OAuth
        const ebayCode = params.get("ebay_code");
        if (ebayCode) {
            completeEbayOAuth({ code: ebayCode })
                .then(() => {
                    toast.success("eBay account connected successfully!");
                    window.history.replaceState(
                        {},
                        "",
                        window.location.pathname
                    );
                })
                .catch((error) => {
                    toast.error(`eBay connection failed: ${error.message}`);
                    window.history.replaceState(
                        {},
                        "",
                        window.location.pathname
                    );
                });
        }

        // Handle TikTok Shop OAuth
        const tiktokCode = params.get("tiktok_code");
        if (tiktokCode) {
            completeTiktokOAuth({ code: tiktokCode })
                .then(() => {
                    toast.success("TikTok Shop account connected successfully!");
                    window.history.replaceState(
                        {},
                        "",
                        window.location.pathname
                    );
                })
                .catch((error) => {
                    toast.error(`TikTok Shop connection failed: ${error.message}`);
                    window.history.replaceState(
                        {},
                        "",
                        window.location.pathname
                    );
                });
        }

        const error = params.get("error");
        if (error) {
            toast.error(`Connection failed: ${decodeURIComponent(error)}`);
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, [completeEbayOAuth, completeTiktokOAuth]);

    return (
        <SidebarProvider>
            <AppSidebar 
                selectedView={selectedView} 
                onViewChange={setSelectedView}
            />
            <SidebarInset>
                <Header />
                <div className="flex-1 overflow-y-auto">
                    <Content selectedView={selectedView} />
                </div>
            </SidebarInset>
            <AltDragSelectionOverlay selectionBox={selectionBox} copiedState={copiedState} />
            <Toaster />
        </SidebarProvider>
    );
}
