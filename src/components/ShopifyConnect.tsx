import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
      const convexUrl = import.meta.env.VITE_CONVEX_URL;
      // Extract deployment name and construct .convex.site URL for HTTP actions
      // VITE_CONVEX_URL is like: https://coordinated-dachshund-843.convex.cloud
      const deploymentName = convexUrl?.split('.')[0].replace('https://', '');
      const siteUrl = deploymentName ? `https://${deploymentName}.convex.site` : window.location.origin;
      const installUrl = `${siteUrl}/shopify/install?shop=${encodeURIComponent(normalizedShop)}`;
      
      window.location.href = installUrl;
    } catch (error: any) {
      toast.error(`Connection failed: ${error.message}`);
      setIsConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle>Shopify</CardTitle>
            <CardDescription>
              {isConnected 
                ? "Your Shopify store is connected and ready to sync orders."
                : "Connect your Shopify store to automatically sync orders and analyze profitability."}
            </CardDescription>
          </div>
          <Badge 
            variant={isConnected ? "default" : "secondary"}
          >
            {isConnected ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Connected
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 mr-1" />
                Not Connected
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      {!isConnected && (
        <CardContent className="space-y-4">
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

        <div className="p-4 bg-muted rounded-md border">
          <h3 className="font-semibold mb-2">Setup Instructions:</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Enter your Shopify store domain above</li>
            <li>Click "Connect Shopify Store"</li>
            <li>You'll be redirected to Shopify to authorize the app</li>
            <li>After authorization, you'll be redirected back to sync orders</li>
          </ol>
        </div>
        </CardContent>
      )}
    </Card>
  );
}
