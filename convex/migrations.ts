import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * One-shot cleanup migrations (already applied on prod).
 * Kept as no-ops / slim helpers so runAll remains callable.
 */

export const collapseOrderIdField = internalMutation({
    args: {},
    handler: async () => {
        return {
            marketplaceProductsUpdated: 0,
            pendingImportsUpdated: 0,
            note: "Already applied — OrderId removed from schema",
        };
    },
});

export const slimPendingFinancialStatus = internalMutation({
    args: {},
    handler: async (ctx) => {
        let updated = 0;
        const pendingImports = await ctx.db
            .query("pendingMarketplaceImports")
            .collect();

        for (const row of pendingImports) {
            const status = row.rawFinancialEventsStatus as
                | Record<string, unknown>
                | undefined;
            if (!status) continue;

            const hasLegacyKeys = Object.keys(status).some(
                (key) =>
                    ![
                        "financeStatusClassification",
                        "suggestFinancesV2024Fallback",
                        "pagesFetched",
                        "usedEstimatedFees",
                        "missingFulfillmentDate",
                    ].includes(key)
            );
            if (!hasLegacyKeys) continue;

            await ctx.db.patch(row._id, {
                rawFinancialEventsStatus: {
                    financeStatusClassification:
                        typeof status.financeStatusClassification === "string"
                            ? status.financeStatusClassification
                            : undefined,
                    suggestFinancesV2024Fallback:
                        typeof status.suggestFinancesV2024Fallback === "boolean"
                            ? status.suggestFinancesV2024Fallback
                            : undefined,
                    pagesFetched:
                        typeof status.pagesFetched === "number"
                            ? status.pagesFetched
                            : 0,
                    usedEstimatedFees: Boolean(status.usedEstimatedFees),
                    missingFulfillmentDate: Boolean(
                        status.missingFulfillmentDate
                    ),
                },
            });
            updated++;
        }

        return { updated };
    },
});

export const migrateShopifyConnections = internalMutation({
    args: {},
    handler: async () => {
        return {
            migrated: 0,
            deleted: 0,
            skipped: [] as string[],
            note: "Already applied — shopifyConnections removed from schema",
        };
    },
});

export const clearShopifyConnections = internalMutation({
    args: {},
    handler: async () => {
        return {
            deleted: 0,
            note: "Already applied — shopifyConnections removed from schema",
        };
    },
});

// Rows imported before isFBA existed: FBA orders are the only ones whose
// shipping was recorded as "FBA Logistics".
export const markFbaMarketplaceProducts = internalMutation({
    args: {},
    handler: async (ctx) => {
        let updated = 0;
        const rows = await ctx.db.query("marketplaceProducts").collect();

        for (const row of rows) {
            if (
                row.marketplace !== "Amazon" ||
                row.isFBA ||
                !row.shipping_breakdown?.some(
                    ([label]) => label === "FBA Logistics"
                )
            ) {
                continue;
            }
            await ctx.db.patch(row._id, { isFBA: true });
            updated++;
        }

        return { updated };
    },
});

export const runAll = internalAction({
    args: {},
    handler: async (
        ctx
    ): Promise<{
        orderId: {
            marketplaceProductsUpdated: number;
            pendingImportsUpdated: number;
            note?: string;
        };
        financial: { updated: number };
        shopify: {
            migrated: number;
            deleted: number;
            skipped: string[];
            note?: string;
        };
        fba: { updated: number };
    }> => {
        const orderId: {
            marketplaceProductsUpdated: number;
            pendingImportsUpdated: number;
            note?: string;
        } = await ctx.runMutation(internal.migrations.collapseOrderIdField, {});
        const financial: { updated: number } = await ctx.runMutation(
            internal.migrations.slimPendingFinancialStatus,
            {}
        );
        const shopify: {
            migrated: number;
            deleted: number;
            skipped: string[];
            note?: string;
        } = await ctx.runMutation(
            internal.migrations.migrateShopifyConnections,
            {}
        );
        const fba: { updated: number } = await ctx.runMutation(
            internal.migrations.markFbaMarketplaceProducts,
            {}
        );
        return { orderId, financial, shopify, fba };
    },
});
