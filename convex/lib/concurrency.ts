type RunWithConcurrencyArgs<T> = {
    items: T[];
    concurrency: number;
    process: (item: T, index: number) => Promise<void>;
};

export async function runWithConcurrency<T>({
    items,
    concurrency,
    process,
}: RunWithConcurrencyArgs<T>): Promise<void> {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
        throw new Error("Concurrency must be a positive integer");
    }

    const entries = items.map((item, index) => ({ item, index }));
    const workerCount = Math.min(concurrency, entries.length);
    let nextIndex = 0;
    let failure: { error: unknown } | undefined;

    const runWorker = async () => {
        while (!failure) {
            const entry = entries[nextIndex];
            if (!entry) return;
            nextIndex += 1;

            try {
                await process(entry.item, entry.index);
            } catch (error: unknown) {
                failure ??= { error };
            }
        }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));

    if (failure) throw failure.error;
}

type ProgressReportArgs = {
    completed: number;
    total: number;
    interval: number;
};

export function shouldReportProgress({
    completed,
    total,
    interval,
}: ProgressReportArgs): boolean {
    return completed === total || completed % interval === 0;
}
