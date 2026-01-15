import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function EbayConnect() {
  const [isConnecting, setIsConnecting] = useState(false);
  const isEbayConnected = useQuery(api.ebayMutations.isEbayConnected);

  const handleConnect = () => {
    setIsConnecting(true);
    
    // Redirect to the backend install endpoint which handles the OAuth flow
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    const deploymentName = convexUrl?.split('.')[0].replace('https://', '');
    const siteUrl = deploymentName ? `https://${deploymentName}.convex.site` : window.location.origin;
    
    window.location.href = `${siteUrl}/ebay/install`;
  };

  if (isEbayConnected) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">eBay Connected</h2>
            <p className="text-gray-600">
              Your eBay account is connected and ready to sync orders.
            </p>
          </div>
          <div className="flex items-center gap-2 text-green-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-semibold">Connected</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
      <h2 className="text-2xl font-bold mb-4">Connect eBay Account</h2>
      <p className="text-gray-600 mb-6">
        Connect your eBay account to automatically sync orders and analyze profitability.
      </p>

      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isConnecting ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Connecting...
          </>
        ) : (
          "Connect eBay Account"
        )}
      </button>

      <div className="mt-6 p-4 bg-blue-50 rounded-md">
        <h3 className="font-semibold text-blue-900 mb-2">Setup Instructions:</h3>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Click "Connect eBay Account"</li>
          <li>You'll be redirected to eBay to authorize the app</li>
          <li>Sign in to your eBay account if prompted</li>
          <li>Grant the requested permissions</li>
          <li>You'll be redirected back to sync orders</li>
        </ol>
      </div>

      <div className="mt-4 p-4 bg-yellow-50 rounded-md">
        <h3 className="font-semibold text-yellow-900 mb-2">⚠️ Configuration Required:</h3>
        <p className="text-sm text-yellow-800">
          Before connecting, make sure you've set up your eBay OAuth credentials in the environment variables:
        </p>
        <ul className="text-sm text-yellow-800 mt-2 space-y-1 list-disc list-inside">
          <li><code className="bg-yellow-100 px-1 rounded">EBAY_CLIENT_ID</code></li>
          <li><code className="bg-yellow-100 px-1 rounded">EBAY_CLIENT_SECRET</code></li>
          <li><code className="bg-yellow-100 px-1 rounded">EBAY_REDIRECT_URI</code></li>
          <li><code className="bg-yellow-100 px-1 rounded">EBAY_ENVIRONMENT</code> (PRODUCTION or SANDBOX)</li>
        </ul>
      </div>
    </div>
  );
}
