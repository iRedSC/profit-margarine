import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";

export function ShopifyConnect() {
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
    <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4">Connect Shopify Store</h2>
      <p className="text-gray-600 mb-6">
        Connect your Shopify store to automatically sync orders and analyze profitability.
      </p>
      
      <form onSubmit={handleConnect} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Shop Domain
          </label>
          <input
            type="text"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="your-store.myshopify.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnecting}
          />
          <p className="text-sm text-gray-500 mt-1">
            Enter your Shopify store domain (e.g., your-store.myshopify.com)
          </p>
        </div>

        <button
          type="submit"
          disabled={isConnecting || !shopDomain}
          className="w-full px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isConnecting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Connecting...
            </>
          ) : (
            "Connect Shopify Store"
          )}
        </button>
      </form>

      <div className="mt-6 p-4 bg-blue-50 rounded-md">
        <h3 className="font-semibold text-blue-900 mb-2">Setup Instructions:</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Enter your Shopify store domain above</li>
          <li>Click "Connect Shopify Store"</li>
          <li>You'll be redirected to Shopify to authorize the app</li>
          <li>After authorization, you'll be redirected back to sync orders</li>
        </ol>
      </div>
    </div>
  );
}
