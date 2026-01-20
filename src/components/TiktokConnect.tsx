import { MarketplaceConnect, MarketplaceConnectConfig } from "./MarketplaceConnect";

type TiktokConnectProps = {
    isConnected?: boolean;
};

const tiktokConfig: MarketplaceConnectConfig = {
    name: "TikTok Shop",
    description: "Connect your TikTok Shop account to automatically sync orders and analyze profitability.",
    installUrl: "/tiktok/install",
    setupInstructions: [
        "Click \"Connect TikTok Shop Account\"",
        "You'll be redirected to TikTok to authorize the app",
        "Sign in to your TikTok Shop account if prompted",
        "Grant the requested permissions",
        "You'll be redirected back to sync orders",
    ],
    buttonText: "Connect TikTok Shop Account",
    buttonIcon: (
        <svg
            className="w-4 h-4 mr-2"
            fill="currentColor"
            viewBox="0 0 24 24"
        >
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05 6.33 6.33 0 0 0-5.23 2.82 6.34 6.34 0 0 0 10.46 7.46 6.34 6.34 0 0 0 3.29-5.58V7.29a4.85 4.85 0 0 0 3.77-4.25V2h-3.45v.44a4.83 4.83 0 0 1-3.77 4.25z" />
        </svg>
    ),
    configWarning: (
        <>
            <h3 className="font-semibold mb-2">⚠️ Configuration Required:</h3>
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
        </>
    ),
};

export function TiktokConnect({ isConnected }: TiktokConnectProps) {
    return <MarketplaceConnect isConnected={isConnected} config={tiktokConfig} />;
}
