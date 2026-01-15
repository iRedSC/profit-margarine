import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function TiktokConnect() {
    const [isConnecting, setIsConnecting] = useState(false);
    const isTiktokConnected = useQuery(api.tiktokMutations.isTiktokConnected);

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

    if (isTiktokConnected) {
        return (
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold mb-2">
                            TikTok Shop Connected
                        </h2>
                        <p className="text-gray-600">
                            Your TikTok Shop account is connected and ready to
                            sync orders.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 text-green-600">
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                        <span className="font-semibold">Connected</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4">
                Connect TikTok Shop Account
            </h2>
            <p className="text-gray-600 mb-6">
                Connect your TikTok Shop account to automatically sync orders
                and analyze profitability.
            </p>

            <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isConnecting ? (
                    <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        Connecting...
                    </>
                ) : (
                    <>
                        <svg
                            className="w-5 h-5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05 6.33 6.33 0 0 0-5.23 2.82 6.34 6.34 0 0 0 10.46 7.46 6.34 6.34 0 0 0 3.29-5.58V7.29a4.85 4.85 0 0 0 3.77-4.25V2h-3.45v.44a4.83 4.83 0 0 1-3.77 4.25z" />
                        </svg>
                        Connect TikTok Shop Account
                    </>
                )}
            </button>

            <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <h3 className="font-semibold text-blue-900 mb-2">
                    Setup Instructions:
                </h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                    <li>Click "Connect TikTok Shop Account"</li>
                    <li>You'll be redirected to TikTok to authorize the app</li>
                    <li>Sign in to your TikTok Shop account if prompted</li>
                    <li>Grant the requested permissions</li>
                    <li>You'll be redirected back to sync orders</li>
                </ol>
            </div>

            <div className="mt-4 p-4 bg-yellow-50 rounded-md">
                <h3 className="font-semibold text-yellow-900 mb-2">
                    ⚠️ Configuration Required:
                </h3>
                <p className="text-sm text-yellow-800 mb-2">
                    Before connecting, you need to:
                </p>
                <ol className="text-sm text-yellow-800 mt-2 space-y-1 list-decimal list-inside mb-3">
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
                <ul className="text-sm text-yellow-800 mt-2 space-y-1 list-disc list-inside ml-4">
                    <li>
                        <code className="bg-yellow-100 px-1 rounded">
                            TIKTOK_CLIENT_KEY
                        </code>{" "}
                        - Your App Key from TikTok Shop Partner Center
                    </li>
                    <li>
                        <code className="bg-yellow-100 px-1 rounded">
                            TIKTOK_CLIENT_SECRET
                        </code>{" "}
                        - Your App Secret from TikTok Shop Partner Center
                    </li>
                    <li>
                        <code className="bg-yellow-100 px-1 rounded">
                            TIKTOK_REDIRECT_URI
                        </code>{" "}
                        - Must match what's configured in TikTok Shop Partner
                        Center
                    </li>
                </ul>
                <p className="text-sm text-yellow-800 mt-3 font-semibold">
                    ⚠️ Important: TikTok Shop API is different from regular
                    TikTok API. Make sure you're using TikTok Shop Partner
                    Center credentials.
                </p>
            </div>
        </div>
    );
}
