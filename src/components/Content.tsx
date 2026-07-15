import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInForm } from "../SignInForm";
import { ShopifyEmbedded } from "../ShopifyEmbedded";
import { ProductAnalyzer } from "./ProductAnalyzer";
import { EbayConnect } from "./EbayConnect";
import { ShopifyConnect } from "./ShopifyConnect";
import { TiktokConnect } from "./TiktokConnect";
import { PendingAmazonImportsCard } from "./PendingAmazonImportsCard";
import { StatsDashboard } from "./StatsDashboard";

type ContentProps = {
    selectedView: string;
};

export function Content({ selectedView }: ContentProps) {
    const loggedInUser = useQuery(api.auth.loggedInUser);
    const isShopifyConnected = useQuery(api.shopifyMutations.isShopifyConnected);
    const isEbayConnected = useQuery(api.ebayMutations.isEbayConnected);
    const isTiktokConnected = useQuery(api.tiktokMutations.isTiktokConnected);

    if (loggedInUser === undefined) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4 p-4 md:p-8 pt-6">
            <Authenticated>
                {selectedView === "products" && (
                    <div className="space-y-4">
                        <ShopifyEmbedded />
                        <ProductAnalyzer />
                    </div>
                )}
                {selectedView === "stats" && <StatsDashboard />}
                {selectedView === "connections" && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Marketplace Connections</h2>
                            <p className="text-muted-foreground">
                                Connect your marketplaces to sync orders and analyze profitability.
                            </p>
                        </div>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            <ShopifyConnect isConnected={isShopifyConnected} />
                            <EbayConnect isConnected={isEbayConnected} />
                            <TiktokConnect isConnected={isTiktokConnected} />
                        </div>
                    </div>
                )}
                {selectedView === "errors" && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Errors</h2>
                            <p className="text-muted-foreground">
                                Review Amazon imports that are being held out of the
                                official list until fulfillment or exact fee data arrives.
                            </p>
                        </div>
                        <PendingAmazonImportsCard />
                    </div>
                )}
            </Authenticated>
            <Unauthenticated>
                <div className="flex items-center justify-center min-h-[calc(100vh-8rem)]">
                    <div className="w-full max-w-md space-y-6">
                        <div className="text-center space-y-2">
                            <h1 className="text-4xl font-bold tracking-tight">
                                Product Profitability Analyzer
                            </h1>
                            <p className="text-xl text-muted-foreground">
                                Sign in to track your products
                            </p>
                        </div>
                        <SignInForm />
                    </div>
                </div>
            </Unauthenticated>
        </div>
    );
}
