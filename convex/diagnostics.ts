import { v } from "convex/values";
import {
    internalMutation,
    query,
    type MutationCtx,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MarketplaceType } from "./marketplaceConnections";
import { cleanErrorMessage } from "./lib/errorText";

const MARKETPLACES: MarketplaceType[] = ["shopify", "tiktok", "ebay", "amazon"];
const MAX_ISSUES_PER_SYNC = 200;
const ISSUE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_SYNC_LIMIT = 15;
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const recordSyncIssue = internalMutation({
    args: {
        syncId: v.id("syncs"),
        severity: v.union(v.literal("error"), v.literal("warning")),
        orderId: v.optional(v.string()),
        message: v.string(),
    },
    handler: async (ctx, args) => {
        const sync = await ctx.db.get(args.syncId);
        if (!sync) return;

        await ctx.db.patch(args.syncId, {
            failedCount:
                args.severity === "error"
                    ? (sync.failedCount ?? 0) + 1
                    : sync.failedCount,
        });

        // The count above stays exact; stored detail rows are capped so a
        // systemic failure across thousands of orders cannot flood the table.
        const stored = await ctx.db
            .query("syncIssues")
            .withIndex("by_sync", (q) => q.eq("syncId", args.syncId))
            .take(MAX_ISSUES_PER_SYNC);
        if (stored.length >= MAX_ISSUES_PER_SYNC) return;

        await ctx.db.insert("syncIssues", {
            userId: sync.userId,
            syncId: args.syncId,
            marketplace: sync.marketplace,
            severity: args.severity,
            orderId: args.orderId,
            message: args.message,
            createdAt: Date.now(),
        });
    },
});

/** Called when a new sync starts so old issue rows don't accumulate forever. */
export async function pruneOldSyncIssues(
    ctx: MutationCtx,
    userId: Id<"users">,
    marketplace: MarketplaceType
): Promise<void> {
    const cutoff = Date.now() - ISSUE_RETENTION_MS;
    const old = await ctx.db
        .query("syncIssues")
        .withIndex("by_user_and_marketplace", (q) =>
            q.eq("userId", userId).eq("marketplace", marketplace)
        )
        .filter((q) => q.lt(q.field("createdAt"), cutoff))
        .take(500);
    for (const issue of old) {
        await ctx.db.delete(issue._id);
    }
}

type SyncOutcome = "running" | "success" | "partial" | "failed" | "canceled";

function syncOutcome(sync: Doc<"syncs">): SyncOutcome {
    if (sync.status === "active") return "running";
    if (sync.status === "canceled") return "canceled";
    if (sync.error) return "failed";
    if ((sync.failedCount ?? 0) > 0) return "partial";
    return "success";
}

export type Health =
    | "healthy"
    | "degraded"
    | "failing"
    | "stale"
    | "never_synced"
    | "not_connected";

type Hint = { title: string; action: string };

/**
 * Translate known error signatures into something actionable. Patterns come
 * from real failures seen in production; unknown errors get no hint and the
 * raw message is shown as-is.
 */
function hintFor(marketplace: MarketplaceType, error: string): Hint | null {
    if (/access denied for (\w+) field/i.test(error) || /ACCESS_DENIED/.test(error)) {
        const field = /access denied for (\w+) field/i.exec(error)?.[1];
        return {
            title: `The ${marketplace} app is missing an API permission${field ? ` (needed for "${field}")` : ""}.`,
            action:
                marketplace === "shopify"
                    ? "Run the connection check to see which scopes are granted, then add the missing scope to the app in Shopify admin (Settings > Apps > Develop apps) or reinstall it."
                    : "Reconnect the marketplace and approve all requested permissions.",
        };
    }
    if (/THROTTLED|rate limit|429/i.test(error)) {
        return {
            title: "The API rate limit was hit.",
            action: "Usually transient. Sync again in a few minutes.",
        };
    }
    if (/token|unauthori[sz]ed|401|invalid_grant|expired/i.test(error)) {
        return {
            title: "The saved login for this marketplace no longer works.",
            action: "Run the connection check. If it still fails, disconnect and reconnect on the Connections page.",
        };
    }
    if (/No .* connection found/i.test(error)) {
        return {
            title: "This marketplace is not connected.",
            action: "Connect it on the Connections page.",
        };
    }
    if (/credentials not configured/i.test(error)) {
        return {
            title: "Server environment variables for this marketplace are missing.",
            action: "Set them in the Convex dashboard for this deployment.",
        };
    }
    if (/Unexpected end of JSON|invalid JSON|Unexpected token/i.test(error)) {
        return {
            title: "The marketplace returned an empty or malformed response.",
            action: "Usually transient. If it repeats, the endpoint in the error needs investigating.",
        };
    }
    return null;
}

function amazonConfigured(): boolean {
    return Boolean(
        process.env.AMAZON_CLIENT_ID &&
            process.env.AMAZON_CLIENT_SECRET &&
            process.env.AMAZON_REFRESH_TOKEN
    );
}

export const getOverview = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return null;
        const now = Date.now();

        const marketplaces = await Promise.all(
            MARKETPLACES.map(async (marketplace) => {
                const connection =
                    marketplace === "amazon"
                        ? null
                        : await ctx.db
                              .query("marketplaceConnections")
                              .withIndex("by_user_and_marketplace", (q) =>
                                  q
                                      .eq("userId", userId)
                                      .eq("marketplace", marketplace)
                              )
                              .first();
                const connected =
                    marketplace === "amazon"
                        ? amazonConfigured()
                        : connection !== null;

                const syncs = await ctx.db
                    .query("syncs")
                    .withIndex("by_user_and_marketplace", (q) =>
                        q.eq("userId", userId).eq("marketplace", marketplace)
                    )
                    .order("desc")
                    .take(RECENT_SYNC_LIMIT);

                const lastSuccess = await ctx.db
                    .query("syncs")
                    .withIndex("by_user_marketplace_status", (q) =>
                        q
                            .eq("userId", userId)
                            .eq("marketplace", marketplace)
                            .eq("status", "finished")
                    )
                    .order("desc")
                    .filter((q) => q.eq(q.field("error"), undefined))
                    .first();

                // Consecutive failures since the last success, ignoring cancels.
                const finished = syncs.filter((s) => s.status === "finished");
                let consecutiveFailures = 0;
                for (const sync of finished) {
                    if (!sync.error) break;
                    consecutiveFailures++;
                }
                const latestFinished = finished[0];
                const latestError = latestFinished?.error
                    ? cleanErrorMessage(latestFinished.error)
                    : undefined;

                let health: Health;
                if (!connected) health = "not_connected";
                else if (!latestFinished) health = "never_synced";
                else if (latestError) health = "failing";
                else if ((latestFinished.failedCount ?? 0) > 0)
                    health = "degraded";
                else if (
                    !lastSuccess ||
                    now - (lastSuccess.finishedAt ?? lastSuccess.startedAt) >
                        STALE_AFTER_MS
                )
                    health = "stale";
                else health = "healthy";

                // Group the latest sync's issues by message so 600 identical
                // failures read as one problem with a count.
                const issueGroups: Array<{
                    message: string;
                    severity: "error" | "warning";
                    count: number;
                    orderIds: string[];
                }> = [];
                if (latestFinished) {
                    const issues = await ctx.db
                        .query("syncIssues")
                        .withIndex("by_sync", (q) =>
                            q.eq("syncId", latestFinished._id)
                        )
                        .take(MAX_ISSUES_PER_SYNC);
                    const byMessage = new Map<string, (typeof issueGroups)[number]>();
                    for (const issue of issues) {
                        const key = `${issue.severity}:${issue.message}`;
                        let group = byMessage.get(key);
                        if (!group) {
                            group = {
                                message: issue.message,
                                severity: issue.severity,
                                count: 0,
                                orderIds: [],
                            };
                            byMessage.set(key, group);
                            issueGroups.push(group);
                        }
                        group.count++;
                        if (issue.orderId && group.orderIds.length < 20) {
                            group.orderIds.push(issue.orderId);
                        }
                    }
                    issueGroups.sort((a, b) => b.count - a.count);
                }

                const hintSource =
                    latestError ?? issueGroups.find((g) => g.severity === "error")?.message;

                return {
                    marketplace,
                    health,
                    connection: connection
                        ? {
                              connectedAt: connection.connectedAt,
                              expiresAt: connection.expiresAt,
                              hasRefreshToken: Boolean(connection.refreshToken),
                              shopDomain: connection.shopDomain,
                              scopes: connection.scopes,
                          }
                        : null,
                    lastSuccessAt: lastSuccess
                        ? (lastSuccess.finishedAt ?? lastSuccess.startedAt)
                        : null,
                    consecutiveFailures,
                    failingSince:
                        consecutiveFailures > 0
                            ? finished[consecutiveFailures - 1].startedAt
                            : null,
                    latestError: latestError ?? null,
                    hint: hintSource ? hintFor(marketplace, hintSource) : null,
                    issueGroups,
                    recentSyncs: syncs.map((sync) => ({
                        _id: sync._id,
                        startedAt: sync.startedAt,
                        finishedAt: sync.finishedAt ?? null,
                        outcome: syncOutcome(sync),
                        total: sync.total,
                        complete: sync.complete,
                        failedCount: sync.failedCount ?? 0,
                        message: sync.message ?? null,
                        error: sync.error ? cleanErrorMessage(sync.error) : null,
                    })),
                };
            })
        );

        return { marketplaces };
    },
});

/** Number of marketplaces needing attention, for the sidebar badge. */
export const getAttentionCount = query({
    args: {},
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) return 0;
        let count = 0;
        for (const marketplace of MARKETPLACES) {
            const latest = await ctx.db
                .query("syncs")
                .withIndex("by_user_marketplace_status", (q) =>
                    q
                        .eq("userId", userId)
                        .eq("marketplace", marketplace)
                        .eq("status", "finished")
                )
                .order("desc")
                .first();
            if (latest && (latest.error || (latest.failedCount ?? 0) > 0)) {
                count++;
            }
        }
        return count;
    },
});
