import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "../_generated/dataModel";

export async function requireUserId(ctx: {
    // Accept any Convex query/mutation ctx
    auth?: unknown;
    storage?: unknown;
    db?: unknown;
}): Promise<Id<"users">> {
    const userId = await getAuthUserId(ctx as any);
    if (!userId) {
        throw new Error("Not authenticated");
    }
    return userId;
}
