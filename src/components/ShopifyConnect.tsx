import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Loader2 } from "lucide-react";
import { MarketplaceConnect, MarketplaceConnectConfig } from "./MarketplaceConnect";
import { buildInstallUrl } from "../lib/urlUtils";

type ShopifyConnectProps = {
  isConnected?: boolean;
};

export function ShopifyConnect({ isConnected }: ShopifyConnectProps) {
  const [shopDomain, setShopDomain] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!shopDomain) {
      toast.error("Please enter your shop domain");
      return;
    }

    setIsConnecting(true);

    try {
      // Normalize shop domain
      let normalizedShop = shopDomain.trim().toLowerCase();
      
      // Remove https:// or http://
      normalizedShop = normalizedShop.replace(/^https?:\/\//, "");
      
      // Remove trailing slash
      normalizedShop = normalizedShop.replace(/\/$/, "");
      
      // Add .myshopify.com if not present
      if (!normalizedShop.includes(".myshopify.com")) {
        normalizedShop = `${normalizedShop}.myshopify.com`;
      }

      // Redirect to OAuth flow - use Convex site URL for HTTP routes
      const installUrl = buildInstallUrl("/shopify/install", { shop: normalizedShop });
      window.location.href = installUrl;
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const shopifyConfig: MarketplaceConnectConfig = {
    name: "Shopify",
    description: "Connect your Shopify store to automatically sync orders and analyze profitability.",
    installUrl: "/shopify/install",
    setupInstructions: [
      "Enter your Shopify store domain above",
      "Click \"Connect Shopify Store\"",
      "You'll be redirected to Shopify to authorize the app",
      "After authorization, you'll be redirected back to sync orders",
    ],
    customForm: (
      <form onSubmit={handleConnect} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Shop Domain
          </label>
          <Input
            type="text"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="your-store.myshopify.com"
            disabled={isConnecting}
          />
          <p className="text-sm text-muted-foreground">
            Enter your Shopify store domain (e.g., your-store.myshopify.com)
          </p>
        </div>

        <Button
          type="submit"
          disabled={isConnecting || !shopDomain}
          className="w-full"
        >
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Connecting...
            </>
          ) : (
            "Connect Shopify Store"
          )}
        </Button>
      </form>
    ),
  };

  return <MarketplaceConnect isConnected={isConnected} config={shopifyConfig} />;
}
