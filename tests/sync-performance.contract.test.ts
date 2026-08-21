import { describe, expect, it, vi } from "vitest";
import {
  runWithConcurrency,
  shouldReportProgress,
} from "../convex/lib/concurrency";
import { collectEbayTransactionPages } from "../convex/ebay/transactions";
import { getIncrementalSyncStart } from "../convex/lib/syncWindow";

describe("sync processing contracts", () => {
  it("never processes more than the configured number of items at once", async () => {
    let active = 0;
    let peak = 0;
    const completed: number[] = [];

    await runWithConcurrency({
      items: [1, 2, 3, 4, 5, 6],
      concurrency: 3,
      process: async (item) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        completed.push(item);
        active -= 1;
      },
    });

    expect(peak).toBe(3);
    expect(completed.toSorted()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("stops scheduling new work after a processor fails", async () => {
    const started: number[] = [];

    await expect(
      runWithConcurrency({
        items: [1, 2, 3, 4, 5, 6],
        concurrency: 2,
        process: async (item) => {
          started.push(item);
          if (item === 2) throw new Error("failed");
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
      }),
    ).rejects.toThrow("failed");

    expect(started).toEqual([1, 2]);
  });

  it("reports progress at intervals and on the final item", () => {
    expect(shouldReportProgress({ completed: 9, total: 21, interval: 10 })).toBe(false);
    expect(shouldReportProgress({ completed: 10, total: 21, interval: 10 })).toBe(true);
    expect(shouldReportProgress({ completed: 21, total: 21, interval: 10 })).toBe(true);
  });
});

describe("eBay transaction paging", () => {
  it("continues until a page is shorter than the requested limit", async () => {
    const fetchPage = vi.fn(async ({ offset }: { offset: number; limit: number }) => ({
      transactions:
        offset === 0
          ? [{ transactionId: "one" }, { transactionId: "two" }]
          : [{ transactionId: "three" }],
    }));

    const transactions = await collectEbayTransactionPages({
      limit: 2,
      fetchPage,
    });

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, { offset: 0, limit: 2 });
    expect(fetchPage).toHaveBeenNthCalledWith(2, { offset: 2, limit: 2 });
    expect(transactions.map((transaction) => transaction.transactionId)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });
});

describe("incremental sync windows", () => {
  it("uses the default lookback before the first successful sync", () => {
    expect(
      getIncrementalSyncStart({
        now: 1_000,
        defaultLookbackMs: 300,
        overlapMs: 50,
      }),
    ).toBe(700);
  });

  it("resumes before the previous successful sync started", () => {
    expect(
      getIncrementalSyncStart({
        now: 1_000,
        defaultLookbackMs: 300,
        overlapMs: 50,
        previousSyncStartedAt: 900,
      }),
    ).toBe(850);
  });
});
