import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type TiktokConnectProps = {
    isConnected?: boolean;
};

export function TiktokConnect({ isConnected }: TiktokConnectProps) {
    const [isConnecting, setIsConnecting] = useState(false);

    const handleConnect = () => {
        setIsConnecting(true);

        // Redirect to the backend install endpoint which handles the OAuth flow
        const convexUrl = import.meta.env.VITE_CONVEX_URL;
        const deploymentName = convexUrl?.split(".")[0].replace("https://", "");
        const siteUrl = deploymentName
            ? `https://${deploymentName}.convex.site`
            : window.location.origin;

        window.location.href = `${siteUrl}/tiktok/install`;
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <CardTitle>TikTok Shop</CardTitle>
                        <CardDescription>
                            {isConnected 
                                ? "Your TikTok Shop account is connected and ready to sync orders."
                                : "Connect your TikTok Shop account to automatically sync orders and analyze profitability."}
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
                        variant="default"
                    >
                        {isConnecting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Connecting...
                            </>
                        ) : (
                            <>
                                <svg
                                    className="w-4 h-4 mr-2"
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05 6.33 6.33 0 0 0-5.23 2.82 6.34 6.34 0 0 0 10.46 7.46 6.34 6.34 0 0 0 3.29-5.58V7.29a4.85 4.85 0 0 0 3.77-4.25V2h-3.45v.44a4.83 4.83 0 0 1-3.77 4.25z" />
                                </svg>
                                Connect TikTok Shop Account
                            </>
                        )}
                    </Button>

                <div className="p-4 bg-muted rounded-md border">
                    <h3 className="font-semibold mb-2">
                        Setup Instructions:
                    </h3>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Click "Connect TikTok Shop Account"</li>
                        <li>You'll be redirected to TikTok to authorize the app</li>
                        <li>Sign in to your TikTok Shop account if prompted</li>
                        <li>Grant the requested permissions</li>
                        <li>You'll be redirected back to sync orders</li>
                    </ol>
                </div>

                <div className="p-4 bg-muted rounded-md border">
                    <h3 className="font-semibold mb-2">
                        ⚠️ Configuration Required:
                    </h3>
                    <p className="text-sm text-muted-foreground mb-2">
                        Before connecting, you need to:
                    </p>
                    <ol className="text-sm text-muted-foreground mt-2 space-y-1 list-decimal list-inside mb-3">
                        <li>
                            Register your app at{" "}
                            <strong>TikTok Shop Partner Center</strong> (not TikTok
                            Developer Portal)
                        </li>
                        <li>
                            Get your App Key (Client Key) and App Secret (Client
                            Secret)
                        </li>
                        <li>
                            Set up your TikTok Shop OAuth credentials in environment
                            variables:
                        </li>
                    </ol>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside ml-4">
                        <li>
                            <code className="bg-background px-1 rounded">
                                TIKTOK_CLIENT_KEY
                            </code>{" "}
                            - Your App Key from TikTok Shop Partner Center
                        </li>
                        <li>
                            <code className="bg-background px-1 rounded">
                                TIKTOK_CLIENT_SECRET
                            </code>{" "}
                            - Your App Secret from TikTok Shop Partner Center
                        </li>
                        <li>
                            <code className="bg-background px-1 rounded">
                                TIKTOK_REDIRECT_URI
                            </code>{" "}
                            - Must match what's configured in TikTok Shop Partner
                            Center
                        </li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-3 font-semibold">
                        ⚠️ Important: TikTok Shop API is different from regular
                        TikTok API. Make sure you're using TikTok Shop Partner
                        Center credentials.
                    </p>
                </div>
                </CardContent>
            )}
        </Card>
    );
}
