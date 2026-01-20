import { ReactNode, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { buildInstallUrl } from "../lib/urlUtils";

export interface MarketplaceConnectConfig {
    name: string;
    description: string;
    connectedDescription?: string;
    installUrl: string;
    setupInstructions: string[];
    configWarning?: ReactNode;
    customForm?: ReactNode;
    buttonText?: string;
    buttonIcon?: ReactNode;
}

type MarketplaceConnectProps = {
    isConnected?: boolean;
    config: MarketplaceConnectConfig;
};

export function MarketplaceConnect({ isConnected, config }: MarketplaceConnectProps) {
    const [isConnecting, setIsConnecting] = useState(false);

    const handleConnect = () => {
        setIsConnecting(true);
        
        // Redirect to the backend install endpoint which handles the OAuth flow
        const url = buildInstallUrl(config.installUrl);
        window.location.href = url;
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <CardTitle>{config.name}</CardTitle>
                        <CardDescription>
                            {isConnected 
                                ? (config.connectedDescription || `Your ${config.name} account is connected and ready to sync orders.`)
                                : config.description}
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
                    {config.customForm ? (
                        config.customForm
                    ) : (
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
                                <>
                                    {config.buttonIcon}
                                    {config.buttonText || `Connect ${config.name} Account`}
                                </>
                            )}
                        </Button>
                    )}

                    <div className="p-4 bg-muted rounded-md border">
                        <h3 className="font-semibold mb-2">Setup Instructions:</h3>
                        <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                            {config.setupInstructions.map((instruction, index) => (
                                <li key={index}>{instruction}</li>
                            ))}
                        </ol>
                    </div>

                    {config.configWarning && (
                        <div className="p-4 bg-muted rounded-md border">
                            {config.configWarning}
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}
