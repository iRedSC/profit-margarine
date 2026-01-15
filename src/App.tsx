import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Toaster, toast } from "sonner";
import { useEffect } from "react";
import { Header } from "./components/Header";
import { Content } from "./components/Content";

export default function App() {
    const completeEbayOAuth = useMutation(api.ebayMutations.completeOAuthFlow);
    const completeTiktokOAuth = useMutation(api.tiktokMutations.completeOAuthFlow);

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
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Header />
            <main className="flex-1 p-8">
                <Content />
            </main>
            <Toaster />
        </div>
    );
}
