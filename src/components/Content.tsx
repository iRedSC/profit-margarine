import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { SignInForm } from "../SignInForm";
import { ShopifyEmbedded } from "../ShopifyEmbedded";
import { ShopifyConnect } from "./ShopifyConnect";
import { EbayConnect } from "./EbayConnect";
import { TiktokConnect } from "./TiktokConnect";
import { ProductAnalyzer } from "./ProductAnalyzer";

export function Content() {
    const loggedInUser = useQuery(api.auth.loggedInUser);
    const isShopifyConnected = useQuery(
        api.shopifyMutations.isShopifyConnected
    );
    const isEbayConnected = useQuery(api.ebayMutations.isEbayConnected);
    const isTiktokConnected = useQuery(api.tiktokMutations.isTiktokConnected);

    if (loggedInUser === undefined) {
        return (
            <div className="flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="max-w-[95%] mx-auto">
            <Authenticated>
                <ShopifyEmbedded />
                {!isShopifyConnected && <ShopifyConnect />}
                {!isEbayConnected && <EbayConnect />}
                {!isTiktokConnected && <TiktokConnect />}
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
