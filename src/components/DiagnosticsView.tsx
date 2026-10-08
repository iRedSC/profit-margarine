import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import {
    AlertTriangle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CircleSlash,
    Copy,
    Loader2,
    PlayCircle,
    XCircle,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { PendingAmazonImportsCard } from "./PendingAmazonImportsCard";
import { getErrorMessage } from "../lib/errors";
import { cn } from "../lib/utils";

type Overview = NonNullable<FunctionReturnType<typeof api.diagnostics.getOverview>>;
type MarketplaceDiagnostics = Overview["marketplaces"][number];
type CheckResult = FunctionReturnType<typeof api.diagnosticsActions.runConnectionCheck>;

const NAMES = {
    shopify: "Shopify",
    tiktok: "TikTok",
    ebay: "eBay",
    amazon: "Amazon",
} as const;

// Product marketplace names used by syncOrderById.
const ORDER_MARKETPLACE = {
    shopify: "Shopify",
    tiktok: "TikTok",
    ebay: "Ebay",
    amazon: "Amazon",
} as const;

const HEALTH = {
    healthy: { label: "Healthy", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
    degraded: { label: "Some orders failing", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    failing: { label: "Sync failing", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
    stale: { label: "No recent success", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
    never_synced: { label: "Never synced", className: "bg-muted text-muted-foreground" },
    not_connected: { label: "Not connected", className: "bg-muted text-muted-foreground" },
} as const;

const OUTCOME = {
    success: "text-emerald-600",
    partial: "text-amber-600",
    failed: "text-red-600",
    canceled: "text-muted-foreground",
    running: "text-blue-600",
} as const;

function formatTime(ms: number | null | undefined): string {
    if (!ms) return "never";
    return new Date(ms).toLocaleString();
}

function formatAgo(ms: number | null | undefined): string {
    if (!ms) return "never";
    const minutes = Math.round((Date.now() - ms) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

function copy(text: string) {
    void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
}

export function DiagnosticsView() {
    const overview = useQuery(api.diagnostics.getOverview);

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Diagnostics</h2>
                <p className="text-muted-foreground">
                    Sync health per marketplace, the exact errors each API returned,
                    and live connection checks.
                </p>
            </div>
            {overview === undefined ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : overview === null ? null : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {overview.marketplaces.map((m) => (
                            <a
                                key={m.marketplace}
                                href={`#diag-${m.marketplace}`}
                                className="rounded-lg border p-3 hover:bg-accent"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">{NAMES[m.marketplace]}</span>
                                    <HealthBadge health={m.health} />
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                    Last success {formatAgo(m.lastSuccessAt)}
                                </div>
                            </a>
                        ))}
                    </div>
                    {overview.marketplaces.map((m) => (
                        <MarketplaceCard key={m.marketplace} data={m} />
                    ))}
                </>
            )}
            <PendingAmazonImportsCard />
        </div>
    );
}

function HealthBadge({ health }: { health: MarketplaceDiagnostics["health"] }) {
    const { label, className } = HEALTH[health];
    return (
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", className)}>
            {label}
        </span>
    );
}

function MarketplaceCard({ data }: { data: MarketplaceDiagnostics }) {
    const runCheck = useAction(api.diagnosticsActions.runConnectionCheck);
    const [check, setCheck] = useState<CheckResult | null>(null);
    const [checking, setChecking] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const handleCheck = async () => {
        setChecking(true);
        try {
            setCheck(await runCheck({ marketplace: data.marketplace }));
        } catch (error: unknown) {
            toast.error(`Check failed to run: ${getErrorMessage(error)}`);
        } finally {
            setChecking(false);
        }
    };

    const { connection } = data;
    const tokenExpired =
        connection?.expiresAt !== undefined && connection.expiresAt < Date.now();

    return (
        <Card id={`diag-${data.marketplace}`}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-3">
                        {NAMES[data.marketplace]}
                        <HealthBadge health={data.health} />
                    </CardTitle>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                        <dt>Last successful sync</dt>
                        <dd>{formatTime(data.lastSuccessAt)}</dd>
                        {data.consecutiveFailures > 0 && (
                            <>
                                <dt>Failing since</dt>
                                <dd className="text-red-600">
                                    {formatTime(data.failingSince)} ({data.consecutiveFailures}{" "}
                                    {data.consecutiveFailures === 1 ? "sync" : "syncs"} in a row)
                                </dd>
                            </>
                        )}
                        {connection && (
                            <>
                                <dt>Connected</dt>
                                <dd>
                                    {formatTime(connection.connectedAt)}
                                    {connection.shopDomain && ` (${connection.shopDomain})`}
                                </dd>
                            </>
                        )}
                        {connection?.expiresAt !== undefined && (
                            <>
                                <dt>Access token</dt>
                                <dd className={cn(tokenExpired && "text-amber-600")}>
                                    {tokenExpired ? "expired" : "expires"} {formatTime(connection.expiresAt)}
                                    {tokenExpired &&
                                        (connection.hasRefreshToken
                                            ? " (refreshed automatically on next sync)"
                                            : " (no refresh token, reconnect needed)")}
                                </dd>
                            </>
                        )}
                        {connection?.scopes && (
                            <>
                                <dt>Scopes</dt>
                                <dd className="break-words font-mono text-xs leading-5">
                                    {connection.scopes.split(/[\s,]+/).join(", ")}
                                </dd>
                            </>
                        )}
                    </dl>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleCheck()}
                    disabled={checking || data.health === "not_connected"}
                >
                    {checking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <PlayCircle className="h-4 w-4" />
                    )}
                    Run connection check
                </Button>
            </CardHeader>
            <CardContent className="space-y-4">
                {data.latestError && (
                    <ErrorBlock title="Latest sync failed with" text={data.latestError} />
                )}
                {data.hint && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950">
                        <div className="font-medium">{data.hint.title}</div>
                        <div className="text-muted-foreground">{data.hint.action}</div>
                    </div>
                )}
                {check && <CheckResults result={check} />}
                {data.issueGroups.length > 0 && (
                    <IssueGroups marketplace={data.marketplace} groups={data.issueGroups} />
                )}
                {data.recentSyncs.length > 0 && (
                    <div>
                        <button
                            className="flex items-center gap-1 text-sm font-medium"
                            onClick={() => setShowHistory((open) => !open)}
                        >
                            {showHistory ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                            Recent syncs ({data.recentSyncs.length})
                        </button>
                        {showHistory && <SyncHistory syncs={data.recentSyncs} />}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function ErrorBlock({ title, text }: { title: string; text: string }) {
    return (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
            <div className="mb-1 flex items-center justify-between text-sm font-medium text-red-800 dark:text-red-300">
                {title}
                <button onClick={() => copy(text)} title="Copy error">
                    <Copy className="h-3.5 w-3.5" />
                </button>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                {text}
            </pre>
        </div>
    );
}

function CheckResults({ result }: { result: CheckResult }) {
    return (
        <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">
                Connection check ({new Date(result.ranAt).toLocaleTimeString()})
            </div>
            <ol className="space-y-1.5">
                {result.steps.map((step) => (
                    <li key={step.label} className="flex gap-2 text-sm">
                        {step.status === "ok" ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : step.status === "warn" ? (
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        ) : (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        )}
                        <div className="min-w-0">
                            <span className="font-medium">{step.label}</span>
                            <span className="text-muted-foreground"> {step.durationMs}ms</span>
                            <div
                                className={cn(
                                    "break-words font-mono text-xs",
                                    step.status === "fail" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"
                                )}
                            >
                                {step.detail}
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function IssueGroups({
    marketplace,
    groups,
}: {
    marketplace: MarketplaceDiagnostics["marketplace"];
    groups: MarketplaceDiagnostics["issueGroups"];
}) {
    const syncOrderById = useAction(api.products.syncOrderById);
    const [retrying, setRetrying] = useState<string | null>(null);

    const retry = async (orderId: string) => {
        setRetrying(orderId);
        try {
            await syncOrderById({ marketplace: ORDER_MARKETPLACE[marketplace], orderId });
            toast.success(`Order ${orderId} synced`);
        } catch (error: unknown) {
            toast.error(`Retry failed: ${getErrorMessage(error)}`);
        } finally {
            setRetrying(null);
        }
    };

    return (
        <div className="space-y-2">
            <div className="text-sm font-medium">Problems in the latest sync</div>
            {groups.map((group) => (
                <div
                    key={`${group.severity}:${group.message}`}
                    className={cn(
                        "rounded-md border p-3 text-sm",
                        group.severity === "warning"
                            ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
                            : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                    )}
                >
                    <div className="flex items-start justify-between gap-2">
                        <div className="break-words font-mono text-xs">{group.message}</div>
                        <div className="flex shrink-0 items-center gap-2">
                            {group.orderIds.length > 0 && (
                                <span className="text-xs font-medium">
                                    {group.count} {group.count === 1 ? "order" : "orders"}
                                </span>
                            )}
                            <button onClick={() => copy(group.message)} title="Copy">
                                <Copy className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
                    {group.orderIds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {group.orderIds.map((orderId) => (
                                <button
                                    key={orderId}
                                    onClick={() => void retry(orderId)}
                                    disabled={retrying !== null}
                                    title="Retry this order"
                                    className="rounded border bg-background px-1.5 py-0.5 font-mono text-xs hover:bg-accent"
                                >
                                    {retrying === orderId ? "retrying..." : orderId}
                                </button>
                            ))}
                            {group.count > group.orderIds.length && (
                                <span className="px-1 text-xs text-muted-foreground">
                                    +{group.count - group.orderIds.length} more
                                </span>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function SyncHistory({ syncs }: { syncs: MarketplaceDiagnostics["recentSyncs"] }) {
    return (
        <table className="mt-2 w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
                <tr>
                    <th className="py-1 pr-3 font-normal">Started</th>
                    <th className="py-1 pr-3 font-normal">Result</th>
                    <th className="py-1 pr-3 font-normal">Orders</th>
                    <th className="py-1 font-normal">Detail</th>
                </tr>
            </thead>
            <tbody>
                {syncs.map((sync) => (
                    <tr key={sync._id} className="border-t align-top">
                        <td className="whitespace-nowrap py-1 pr-3">{formatTime(sync.startedAt)}</td>
                        <td className={cn("py-1 pr-3 font-medium", OUTCOME[sync.outcome])}>
                            {sync.outcome === "canceled" ? (
                                <span className="inline-flex items-center gap-1">
                                    <CircleSlash className="h-3 w-3" /> canceled
                                </span>
                            ) : (
                                sync.outcome
                            )}
                        </td>
                        <td className="whitespace-nowrap py-1 pr-3">
                            {sync.complete}/{sync.total}
                            {sync.failedCount > 0 && (
                                <span className="text-red-600"> ({sync.failedCount} failed)</span>
                            )}
                        </td>
                        <td className="break-words py-1 font-mono text-xs text-muted-foreground">
                            {sync.error ?? sync.message}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
