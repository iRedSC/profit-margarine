const HOUR_MS = 60 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 24 * HOUR_MS;

/** Wait 1h after the first failure, doubling per attempt, capped at a day. */
export function isOrderRetryDue(
    failure: { attempts: number; lastAttemptAt: number },
    now: number
): boolean {
    const delay = Math.min(
        HOUR_MS * 2 ** Math.max(0, failure.attempts - 1),
        MAX_RETRY_DELAY_MS
    );
    return now >= failure.lastAttemptAt + delay;
}
