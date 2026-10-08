import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Amazon SP-API credentials are deployment-wide env vars for one seller
// account, so only one user may import it: the one whose sign-in email is
// AMAZON_OWNER_EMAIL. Unset means nobody, so a misconfigured deployment
// fails closed instead of letting every account import the seller's orders.
export async function isAmazonOwner(
    ctx: QueryCtx,
    userId: Id<"users">
): Promise<boolean> {
    const ownerEmail = process.env.AMAZON_OWNER_EMAIL?.trim().toLowerCase();
    if (!ownerEmail) return false;
    const user = await ctx.db.get(userId);
    return user?.email?.trim().toLowerCase() === ownerEmail;
}

export async function requireAmazonOwner(
    ctx: QueryCtx,
    userId: Id<"users">
): Promise<void> {
    if (!(await isAmazonOwner(ctx, userId))) {
        throw new Error(
            "Amazon sync is only available to the account set in AMAZON_OWNER_EMAIL"
        );
    }
}
