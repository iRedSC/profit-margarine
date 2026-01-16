/**
 * Date range utility functions for filtering products
 */

export type DateRangeType = 
  | 'today' 
  | 'thisWeek' 
  | 'thisMonth' 
  | 'yesterday' 
  | 'lastWeek' 
  | 'lastMonth'
  | 'last24Hours'
  | 'last7Days'
  | 'last30Days'
  | 'last90Days'
  | 'allTime';

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
 * Get start of week (Monday 12:00:00 AM)
 */
function getStartOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  start.setDate(diff);
  return getStartOfDay(start);
}

/**
 * Get end of week (Sunday 11:59:59.999 PM)
 */
function getEndOfWeek(date: Date): Date {
  const end = new Date(date);
  const day = end.getDay();
  const diff = end.getDate() - day + (day === 0 ? 0 : 7); // Adjust to Sunday
  end.setDate(diff);
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
export function getDateRange(rangeType: DateRangeType): { start: number | null; end: number | null } {
  const now = new Date();
  
  switch (rangeType) {
    case 'today': {
      const start = getStartOfDay(now);
      const end = getEndOfDay(now);
      return { start: start.getTime(), end: end.getTime() };
    }
    
    case 'thisWeek': {
      const start = getStartOfWeek(now);
      const end = getEndOfWeek(now);
      return { start: start.getTime(), end: end.getTime() };
    }
    
    case 'thisMonth': {
      const start = getStartOfMonth(now);
      const end = getEndOfMonth(now);
      return { start: start.getTime(), end: end.getTime() };
    }
    
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const start = getStartOfDay(yesterday);
      const end = getEndOfDay(yesterday);
      return { start: start.getTime(), end: end.getTime() };
    }
    
    case 'lastWeek': {
      // Get the start of this week (Monday)
      const thisWeekStart = getStartOfWeek(now);
      // Go back 1 day to get to last Sunday
      const lastSunday = new Date(thisWeekStart);
      lastSunday.setDate(lastSunday.getDate() - 1);
      // Get the week boundaries for last week
      const start = getStartOfWeek(lastSunday);
      const end = getEndOfWeek(lastSunday);
      return { start: start.getTime(), end: end.getTime() };
    }
    
    case 'lastMonth': {
      const lastMonth = new Date(now);
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const start = getStartOfMonth(lastMonth);
      const end = getEndOfMonth(lastMonth);
      return { start: start.getTime(), end: end.getTime() };
    }
    
    case 'last24Hours': {
      const end = Date.now();
      const start = end - 24 * 60 * 60 * 1000;
      return { start, end };
    }
    
    case 'last7Days': {
      const end = Date.now();
      const start = end - 7 * 24 * 60 * 60 * 1000;
      return { start, end };
    }
    
    case 'last30Days': {
      const end = Date.now();
      const start = end - 30 * 24 * 60 * 60 * 1000;
      return { start, end };
    }
    
    case 'last90Days': {
      const end = Date.now();
      const start = end - 90 * 24 * 60 * 60 * 1000;
      return { start, end };
    }
    
    case 'allTime':
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
    return rangeType === 'allTime';
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
