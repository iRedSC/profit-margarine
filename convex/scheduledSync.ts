import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { createSyncRecord } from "./products/sync";
import { isAmazonOwner } from "./lib/amazonOwner";

type Marketplace = Doc<"syncs">["marketplace"];

// A sync still "active" after this long is assumed dead (e.g. the action hit
// its timeout before marking itself finished), so the cron replaces it.
const STALE_ACTIVE_SYNC_MS = 6 * 60 * 60 * 1000;

/**
 * For every connected marketplace of every user: refresh recent orders still
 * missing final fees or labels, then run the same incremental sync as the
 * "Sync" button for new orders. Skips marketplaces that already have a sync
 * running so a cron tick never cancels a manual or one-year sync.
 */
export const startScheduledSyncs = internalMutation({
    args: {},
    handler: async (ctx) => {
        const users = await ctx.db.query("users").collect();
        for (const user of users) {
            for (const marketplace of await connectedMarketplaces(
                ctx,
                user._id
            )) {
                if (await hasLiveSync(ctx, user._id, marketplace)) continue;

                const syncId = await createSyncRecord(
                    ctx,
                    user._id,
                    marketplace
                );
                await ctx.scheduler.runAfter(
                    0,
                    internal.productResync.refreshIncompleteOrdersAction,
                    { userId: user._id, syncId, marketplace }
                );
            }
        }
    },
});

async function connectedMarketplaces(
    ctx: MutationCtx,
    userId: Id<"users">
): Promise<Marketplace[]> {
    const connections = await ctx.db
        .query("marketplaceConnections")
        .withIndex("by_user_and_marketplace", (q) => q.eq("userId", userId))
        .collect();
    const marketplaces: Marketplace[] = connections.map((c) => c.marketplace);

    // Amazon credentials are deployment-wide env vars, not a per-user
    // connection; only the configured owner syncs them.
    if (process.env.AMAZON_REFRESH_TOKEN && (await isAmazonOwner(ctx, userId))) {
        marketplaces.push("amazon");
    }

    return marketplaces;
}

async function hasLiveSync(
    ctx: MutationCtx,
    userId: Id<"users">,
    marketplace: Marketplace
): Promise<boolean> {
    const active = await ctx.db
        .query("syncs")
        .withIndex("by_user_marketplace_status", (q) =>
            q
                .eq("userId", userId)
                .eq("marketplace", marketplace)
                .eq("status", "active")
        )
        .collect();
    const cutoff = Date.now() - STALE_ACTIVE_SYNC_MS;
    return active.some((sync) => sync.startedAt > cutoff);
}
