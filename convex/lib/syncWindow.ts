type IncrementalSyncStartArgs = {
    now: number;
    defaultLookbackMs: number;
    overlapMs: number;
    previousSyncStartedAt?: number;
};

export function getIncrementalSyncStart({
    now,
    defaultLookbackMs,
    overlapMs,
    previousSyncStartedAt,
}: IncrementalSyncStartArgs): number {
    if (previousSyncStartedAt === undefined) return now - defaultLookbackMs;
    return Math.min(now, previousSyncStartedAt - overlapMs);
}
