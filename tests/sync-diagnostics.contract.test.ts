import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanErrorMessage } from "../convex/lib/errorText";
import { assertTiktokTokenOk } from "../convex/tiktok/token";
import { fetchShopifyGraphQL } from "../convex/shopify/graphql";
import { processWithProgress } from "../convex/marketplaceUtils";
import type { ActionCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

describe("error text", () => {
  it("strips Convex's Uncaught prefix and stack frames", () => {
    expect(
      cleanErrorMessage(
        "Uncaught Error: Invalid token response: access_token\n    at handler (../convex/tiktokOAuth.ts:123:17)\n",
      ),
    ).toBe("Invalid token response: access_token");
    expect(cleanErrorMessage(new Error("plain"))).toBe("plain");
  });
});

describe("TikTok token responses", () => {
  it("reports TikTok's own code and message on HTTP-200 failures", () => {
    // Real response from /token/get when given a refresh token.
    expect(() =>
      assertTiktokTokenOk(
        {
          code: 98001004,
          message: "invalid params",
          request_id: "202610051604218C9C93D4B222C0716AA4",
        },
        "token refresh",
      ),
    ).toThrow(
      "TikTok token refresh failed: invalid params (code 98001004, request 202610051604218C9C93D4B222C0716AA4)",
    );
    expect(() =>
      assertTiktokTokenOk({ code: 0, data: { access_token: "x" } }, "token refresh"),
    ).not.toThrow();
  });
});

describe("Shopify GraphQL errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("throws the real error when a partial error nulls the root field", async () => {
    // Real production response: ACCESS_DENIED on a non-null child nulls `order`.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: { order: null },
          errors: [
            {
              message: "Access denied for fulfillmentOrders field.",
              path: ["order", "fulfillmentOrders"],
              extensions: { code: "ACCESS_DENIED" },
            },
          ],
        }),
      ),
    );

    await expect(
      fetchShopifyGraphQL("query", {}, "shop.myshopify.com", "token", {
        allowPartial: true,
      }),
    ).rejects.toThrow(
      "Access denied for fulfillmentOrders field. [ACCESS_DENIED at order.fulfillmentOrders]",
    );
  });

  it("tolerates partial errors when the root field is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: { order: { id: "1", events: null } },
          errors: [{ message: "nope", path: ["order", "events"] }],
        }),
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      fetchShopifyGraphQL("query", {}, "shop.myshopify.com", "token", {
        allowPartial: true,
      }),
    ).resolves.toEqual({ order: { id: "1", events: null } });
  });
});

function fakeCtx(initialFailures: string[] = []) {
  const issues: Array<{ orderId?: string; message: string }> = [];
  const failures = new Set(initialFailures);
  const ctx = {
    runQuery: vi.fn(async (_ref: unknown, args: Record<string, unknown>) =>
      "syncId" in args ? { status: "active" } : [...failures],
    ),
    runMutation: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
      if ("severity" in args) {
        issues.push({
          orderId: args.orderId as string | undefined,
          message: args.message as string,
        });
      } else if ("error" in args) {
        failures.add(args.orderId as string);
      } else if ("orderId" in args) {
        failures.delete(args.orderId as string);
      }
    }),
  } as unknown as ActionCtx;
  return { ctx, issues, failures };
}

describe("per-order failure handling", () => {
  const syncId = "sync" as Id<"syncs">;
  const userId = "user" as Id<"users">;

  it("records a failing order and keeps processing the rest", async () => {
    const { ctx, issues } = fakeCtx();
    const result = await processWithProgress({
      ctx,
      userId,
      syncId,
      marketplace: "shopify",
      items: ["a", "b", "c"],
      orderIdOf: (id) => id,
      processor: async (id) => {
        if (id === "b") throw new Error("Uncaught Error: boom\n    at x");
      },
    });

    expect(result).toEqual({ total: 3, succeeded: 2, failed: 1 });
    expect(issues).toEqual([{ orderId: "b", message: "boom" }]);
  });

  it("keeps failed orders for retry until one succeeds", async () => {
    const { ctx, failures } = fakeCtx(["old"]);
    await processWithProgress({
      ctx,
      userId,
      syncId,
      marketplace: "shopify",
      items: ["old", "new"],
      orderIdOf: (id) => id,
      processor: async (id) => {
        if (id === "new") throw new Error("boom");
      },
    });

    expect([...failures]).toEqual(["new"]);
  });

  it("stops when the first orders all fail, since the cause is systemic", async () => {
    const { ctx } = fakeCtx();
    const processed: number[] = [];
    await expect(
      processWithProgress({
        ctx,
        userId,
        syncId,
        marketplace: "shopify",
        items: Array.from({ length: 50 }, (_, i) => i),
        orderIdOf: String,
        processor: async (i) => {
          processed.push(i);
          throw new Error("ACCESS_DENIED");
        },
      }),
    ).rejects.toThrow("orders all failed. Last error: ACCESS_DENIED");
    expect(processed.length).toBeLessThan(15);
  });
});
