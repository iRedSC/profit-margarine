import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type EbayConnectProps = {
  isConnected?: boolean;
};

export function EbayConnect({ isConnected }: EbayConnectProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    
    // Redirect to the backend install endpoint which handles the OAuth flow
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    const deploymentName = convexUrl?.split('.')[0].replace('https://', '');
    const siteUrl = deploymentName ? `https://${deploymentName}.convex.site` : window.location.origin;
    
    window.location.href = `${siteUrl}/ebay/install`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle>eBay</CardTitle>
            <CardDescription>
              {isConnected 
                ? "Your eBay account is connected and ready to sync orders."
                : "Connect your eBay account to automatically sync orders and analyze profitability."}
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
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Connecting...
              </>
            ) : (
              "Connect eBay Account"
            )}
          </Button>

        <div className="p-4 bg-muted rounded-md border">
          <h3 className="font-semibold mb-2">Setup Instructions:</h3>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Click "Connect eBay Account"</li>
            <li>You'll be redirected to eBay to authorize the app</li>
            <li>Sign in to your eBay account if prompted</li>
            <li>Grant the requested permissions</li>
            <li>You'll be redirected back to sync orders</li>
          </ol>
        </div>

        <div className="p-4 bg-muted rounded-md border">
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
        </div>
        </CardContent>
      )}
    </Card>
  );
}
