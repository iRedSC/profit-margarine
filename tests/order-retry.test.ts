import { describe, expect, it } from "vitest";
import { isOrderRetryDue } from "../convex/lib/orderRetry";

const HOUR = 60 * 60 * 1000;

describe("failed order retry backoff", () => {
  it("waits an hour after the first failure", () => {
    expect(isOrderRetryDue({ attempts: 1, lastAttemptAt: 0 }, HOUR - 1)).toBe(false);
    expect(isOrderRetryDue({ attempts: 1, lastAttemptAt: 0 }, HOUR)).toBe(true);
  });

  it("doubles the wait per attempt", () => {
    expect(isOrderRetryDue({ attempts: 3, lastAttemptAt: 0 }, 4 * HOUR - 1)).toBe(false);
    expect(isOrderRetryDue({ attempts: 3, lastAttemptAt: 0 }, 4 * HOUR)).toBe(true);
  });

  it("never waits more than a day, so no order is abandoned", () => {
    expect(isOrderRetryDue({ attempts: 50, lastAttemptAt: 0 }, 24 * HOUR)).toBe(true);
  });
});
