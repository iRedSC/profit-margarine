/**
 * Date range utility functions for filtering products
 */

export type DateRangeType =
    | "today"
    | "thisWeek"
    | "thisMonth"
    | "yesterday"
    | "lastWeek"
    | "lastMonth"
    | "last24Hours"
    | "last7Days"
    | "last30Days"
    | "last90Days"
    | "allTime";

/**
 * Get start of day (12:00:00 AM) for a given date
 */
function getStartOfDay(date: Date): Date {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
}

/**
 * Get end of day (11:59:59.999 PM) for a given date
 */
function getEndOfDay(date: Date): Date {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
}

/**
 * Get start of week (Saturday 12:00:00 AM)
 */
function getStartOfWeek(date: Date): Date {
    const start = new Date(date);
    const day = start.getDay();
    // Adjust to Saturday (day 6)
    // Calculate days to subtract to reach Saturday
    // Saturday (6) -> 0 days back, Sunday (0) -> 1 day back, Monday (1) -> 2 days back, etc.
    const daysToSubtract = day === 6 ? 0 : day + 1;
    start.setDate(start.getDate() - daysToSubtract);
    return getStartOfDay(start);
}

/**
 * Get end of week (Friday 11:59:59.999 PM)
 */
function getEndOfWeek(date: Date): Date {
    const end = new Date(date);
    const day = end.getDay();
    // Adjust to Friday (day 5)
    // Calculate days to add to reach Friday
    // Saturday (6) -> +6 days, Sunday (0) -> +5 days, Monday (1) -> +4 days, etc.
    const daysToAdd = day === 5 ? 0 : day === 6 ? 6 : 5 - day;
    end.setDate(end.getDate() + daysToAdd);
    return getEndOfDay(end);
}

/**
 * Get start of month (first day 12:00:00 AM)
 */
function getStartOfMonth(date: Date): Date {
    const start = new Date(date);
    start.setDate(1);
    return getStartOfDay(start);
}

/**
 * Get end of month (last day 11:59:59.999 PM)
 */
function getEndOfMonth(date: Date): Date {
    const end = new Date(date);
    end.setMonth(end.getMonth() + 1, 0); // Set to last day of current month
    return getEndOfDay(end);
}

/**
 * Calculate date range based on type
 */
export function getDateRange(rangeType: DateRangeType): {
    start: number | null;
    end: number | null;
} {
    const now = new Date();

    switch (rangeType) {
        case "today": {
            const start = getStartOfDay(now);
            const end = getEndOfDay(now);
            return { start: start.getTime(), end: end.getTime() };
        }

        case "thisWeek": {
            const start = getStartOfWeek(now);
            const end = getEndOfWeek(now);
            return { start: start.getTime(), end: end.getTime() };
        }

        case "thisMonth": {
            const start = getStartOfMonth(now);
            const end = getEndOfMonth(now);
            return { start: start.getTime(), end: end.getTime() };
        }

        case "yesterday": {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const start = getStartOfDay(yesterday);
            const end = getEndOfDay(yesterday);
            return { start: start.getTime(), end: end.getTime() };
        }

        case "lastWeek": {
            // Get the start of this week (Saturday)
            const thisWeekStart = getStartOfWeek(now);
            // Go back 7 days to get to last week's Saturday
            const lastWeekSaturday = new Date(thisWeekStart);
            lastWeekSaturday.setDate(lastWeekSaturday.getDate() - 7);
            // Get the week boundaries for last week
            const start = getStartOfWeek(lastWeekSaturday);
            const end = getEndOfWeek(lastWeekSaturday);
            return { start: start.getTime(), end: end.getTime() };
        }

        case "lastMonth": {
            const lastMonth = new Date(now);
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const start = getStartOfMonth(lastMonth);
            const end = getEndOfMonth(lastMonth);
            return { start: start.getTime(), end: end.getTime() };
        }

        case "last24Hours": {
            const end = Date.now();
            const start = end - 24 * 60 * 60 * 1000;
            return { start, end };
        }

        case "last7Days": {
            const end = Date.now();
            const start = end - 7 * 24 * 60 * 60 * 1000;
            return { start, end };
        }

        case "last30Days": {
            const end = Date.now();
            const start = end - 30 * 24 * 60 * 60 * 1000;
            return { start, end };
        }

        case "last90Days": {
            const end = Date.now();
            const start = end - 90 * 24 * 60 * 60 * 1000;
            return { start, end };
        }

        case "allTime":
        default:
            return { start: null, end: null };
    }
}

/**
 * Check if a date range matches a specific range type
 */
export function isDateRangeType(
    rangeStart: number | null,
    rangeEnd: number | null,
    rangeType: DateRangeType
): boolean {
    if (rangeStart === null || rangeEnd === null) {
        return rangeType === "allTime";
    }

    const expectedRange = getDateRange(rangeType);

    if (expectedRange.start === null || expectedRange.end === null) {
        return false;
    }

    // Allow small tolerance for millisecond differences
    const tolerance = 1000;
    return (
        Math.abs(rangeStart - expectedRange.start) <= tolerance &&
        Math.abs(rangeEnd - expectedRange.end) <= tolerance
    );
}

/**
 * What the user picked in a date filter. Presets are relative to now; months
 * and custom ranges are fixed calendar dates in local time.
 */
export type DateRangeSelection =
    | { kind: "preset"; preset: DateRangeType }
    /** "YYYY-MM" */
    | { kind: "month"; month: string }
    /** Inclusive "YYYY-MM-DD" days. An empty side is open-ended. */
    | { kind: "custom"; start: string; end: string };

function pad2(value: number): string {
    return String(value).padStart(2, "0");
}

export function toMonthKey(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function toDayKey(date: Date): string {
    return `${toMonthKey(date)}-${pad2(date.getDate())}`;
}

function parseDayKey(key: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseMonthKey(key: string): Date | null {
    const match = /^(\d{4})-(\d{2})$/.exec(key);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

export function formatMonthKey(key: string): string {
    const date = parseMonthKey(key);
    return date
        ? date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : key;
}

/** The `count` full calendar months before the current one, newest first. */
export function recentMonthKeys(count: number, now = new Date()): string[] {
    return Array.from({ length: count }, (_, index) =>
        toMonthKey(new Date(now.getFullYear(), now.getMonth() - index - 1, 1))
    );
}

export function resolveDateRange(selection: DateRangeSelection): {
    start: number | null;
    end: number | null;
} {
    switch (selection.kind) {
        case "preset":
            return getDateRange(selection.preset);
        case "month": {
            const month = parseMonthKey(selection.month);
            if (!month) return { start: null, end: null };
            return {
                start: getStartOfMonth(month).getTime(),
                end: getEndOfMonth(month).getTime(),
            };
        }
        case "custom": {
            const start = parseDayKey(selection.start);
            const end = parseDayKey(selection.end);
            // Tolerate a reversed range rather than silently matching nothing.
            const [from, to] =
                start && end && start > end ? [end, start] : [start, end];
            return {
                start: from ? getStartOfDay(from).getTime() : null,
                end: to ? getEndOfDay(to).getTime() : null,
            };
        }
    }
}

/**
 * The period to compare a range against. A range still in progress compares
 * with the same elapsed stretch of the period before it, so Today at 4pm
 * compares with yesterday until 4pm, not with all of yesterday. Ranges that
 * start on the 1st and stay inside that month step back one calendar month
 * (August compares with all of July); anything else steps back by its own
 * length. Returns null when there is nothing to compare: all time, or a range
 * that hasn't started yet.
 */
export function previousPeriod(
    start: number | null,
    end: number | null,
    now = Date.now()
): { start: number; end: number } | null {
    if (start === null) return null;
    const effectiveEnd = Math.min(end ?? now, now);
    if (effectiveEnd < start) return null;

    const startDate = new Date(start);
    const monthEnd = getEndOfMonth(startDate).getTime();
    const isMonthAligned =
        start === getStartOfMonth(startDate).getTime() &&
        effectiveEnd <= monthEnd;
    if (isMonthAligned) {
        const prevStart = new Date(
            startDate.getFullYear(),
            startDate.getMonth() - 1,
            1
        );
        const prevMonthEnd = getEndOfMonth(prevStart).getTime();
        return {
            start: prevStart.getTime(),
            end:
                effectiveEnd === monthEnd
                    ? prevMonthEnd
                    : Math.min(
                          prevStart.getTime() + (effectiveEnd - start),
                          prevMonthEnd
                      ),
        };
    }

    const fullLength = (end ?? now) - start + 1;
    const prevStart = start - fullLength;
    return { start: prevStart, end: prevStart + (effectiveEnd - start) };
}

export function formatRangeLabel(start: number, end: number): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const sameYear = startDate.getFullYear() === endDate.getFullYear();
    const format = (date: Date, withYear: boolean) =>
        date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            ...(withYear ? { year: "numeric" } : {}),
        });
    if (toDayKey(startDate) === toDayKey(endDate)) {
        return format(startDate, true);
    }
    return `${format(startDate, !sameYear)} – ${format(endDate, true)}`;
}
