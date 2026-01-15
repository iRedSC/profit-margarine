import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInForm } from "../SignInForm";
import { ShopifyEmbedded } from "../ShopifyEmbedded";
import { ShopifyConnect } from "./ShopifyConnect";
import { EbayConnect } from "./EbayConnect";
import { TiktokConnect } from "./TiktokConnect";
import { ProductAnalyzer } from "./ProductAnalyzer";
import { useState } from "react";

export function Content() {
    const loggedInUser = useQuery(api.auth.loggedInUser);
    const isShopifyConnected = useQuery(
        api.shopifyMutations.isShopifyConnected
    );
    const isEbayConnected = useQuery(api.ebayMutations.isEbayConnected);
    const isTiktokConnected = useQuery(api.tiktokMutations.isTiktokConnected);
    const [isConnectorSectionOpen, setIsConnectorSectionOpen] = useState(false);

    if (loggedInUser === undefined) {
        return (
            <div className="flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    const hasDisconnectedMarketplaces = 
        !isShopifyConnected || !isEbayConnected || !isTiktokConnected;

    return (
        <div className="max-w-[95%] mx-auto">
            <Authenticated>
                <ShopifyEmbedded />
                {hasDisconnectedMarketplaces && (
                    <div className="bg-white rounded-lg shadow-sm mb-8">
                        <button
                            onClick={() => setIsConnectorSectionOpen(!isConnectorSectionOpen)}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                            <h2 className="text-xl font-semibold">
                                Marketplace Connections
                            </h2>
                            <svg
                                className={`w-5 h-5 transition-transform ${
                                    isConnectorSectionOpen ? "rotate-180" : ""
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                />
                            </svg>
                        </button>
                        {isConnectorSectionOpen && (
                            <div className="px-6 pb-6">
                                {!isShopifyConnected && <ShopifyConnect />}
                                {!isEbayConnected && <EbayConnect />}
                                {!isTiktokConnected && <TiktokConnect />}
                            </div>
                        )}
                    </div>
                )}
                <ProductAnalyzer />
            </Authenticated>
            <Unauthenticated>
                <div className="max-w-md mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-primary mb-4">
                            Product Profitability Analyzer
                        </h1>
                        <p className="text-xl text-secondary">
                            Sign in to track your products
                        </p>
                    </div>
                    <SignInForm />
                </div>
            </Unauthenticated>
        </div>
    );
}
