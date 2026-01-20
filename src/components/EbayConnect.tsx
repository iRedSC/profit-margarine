import { MarketplaceConnect, MarketplaceConnectConfig } from "./MarketplaceConnect";
import { buildInstallUrl } from "../lib/urlUtils";

type EbayConnectProps = {
  isConnected?: boolean;
};

const ebayConfig: MarketplaceConnectConfig = {
  name: "eBay",
  description: "Connect your eBay account to automatically sync orders and analyze profitability.",
  installUrl: "/ebay/install",
  setupInstructions: [
    "Click \"Connect eBay Account\"",
    "You'll be redirected to eBay to authorize the app",
    "Sign in to your eBay account if prompted",
    "Grant the requested permissions",
    "You'll be redirected back to sync orders",
  ],
  configWarning: (
    <>
      <h3 className="font-semibold mb-2">⚠️ Configuration Required:</h3>
      <p className="text-sm text-muted-foreground">
        Before connecting, make sure you've set up your eBay OAuth credentials in the environment variables:
      </p>
      <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
        <li><code className="bg-background px-1 rounded">EBAY_CLIENT_ID</code></li>
        <li><code className="bg-background px-1 rounded">EBAY_CLIENT_SECRET</code></li>
        <li><code className="bg-background px-1 rounded">EBAY_REDIRECT_URI</code></li>
        <li><code className="bg-background px-1 rounded">EBAY_ENVIRONMENT</code> (PRODUCTION or SANDBOX)</li>
      </ul>
    </>
  ),
};

export function EbayConnect({ isConnected }: EbayConnectProps) {
  return <MarketplaceConnect isConnected={isConnected} config={ebayConfig} />;
}
