import { afterEach, describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import { isAmazonOwner } from "../convex/lib/amazonOwner";

const userId = "user1" as Id<"users">;
const ctxWithEmail = (email: string | undefined) =>
  ({ db: { get: async () => ({ _id: userId, email }) } }) as unknown as QueryCtx;

describe("Amazon owner", () => {
  afterEach(() => {
    delete process.env.AMAZON_OWNER_EMAIL;
  });

  it("matches only the exact configured email", async () => {
    process.env.AMAZON_OWNER_EMAIL = " seller@example.com ";
    expect(await isAmazonOwner(ctxWithEmail("seller@example.com"), userId)).toBe(true);
    expect(await isAmazonOwner(ctxWithEmail("other@example.com"), userId)).toBe(false);
    expect(await isAmazonOwner(ctxWithEmail(undefined), userId)).toBe(false);
  });

  it("rejects case and whitespace variants, which are separate accounts", async () => {
    process.env.AMAZON_OWNER_EMAIL = "seller@example.com";
    expect(await isAmazonOwner(ctxWithEmail("SELLER@example.com"), userId)).toBe(false);
    expect(await isAmazonOwner(ctxWithEmail(" seller@example.com"), userId)).toBe(false);
  });

  it("allows nobody when unset", async () => {
    expect(await isAmazonOwner(ctxWithEmail("seller@example.com"), userId)).toBe(false);
    process.env.AMAZON_OWNER_EMAIL = "  ";
    expect(await isAmazonOwner(ctxWithEmail(""), userId)).toBe(false);
  });
});
