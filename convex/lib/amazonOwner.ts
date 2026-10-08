import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Amazon SP-API credentials are deployment-wide env vars for one seller
// account, so only one user may import it: the one whose sign-in email is
// AMAZON_OWNER_EMAIL. Unset means nobody, so a misconfigured deployment
// fails closed instead of letting every account import the seller's orders.
//
// The comparison is exact on purpose. The Password provider stores emails
// verbatim and only rejects exact duplicates, so "SELLER@example.com" is a
// separate account from "seller@example.com". Normalizing here would let
// anyone sign up with a case variant of the owner's email and pass.
export async function isAmazonOwner(
    ctx: QueryCtx,
    userId: Id<"users">
): Promise<boolean> {
    const ownerEmail = process.env.AMAZON_OWNER_EMAIL?.trim();
    if (!ownerEmail) return false;
    const user = await ctx.db.get(userId);
    return user?.email === ownerEmail;
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
