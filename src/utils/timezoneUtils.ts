export interface TimezoneOption {
  value: string;
  label: string;
  shortLabel: string;
  offset: string;
  group: string;
  isIndian?: boolean;
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // India & South Asia (Featured at top for easy discovery)
  {
    value: 'Asia/Kolkata',
    label: '🇮🇳 India Standard Time (IST) - UTC+05:30',
    shortLabel: 'IST (UTC+05:30)',
    offset: '+05:30',
    group: 'India & South Asia',
    isIndian: true,
  },
  {
    value: 'Asia/Colombo',
    label: '🇱🇰 Sri Lanka Standard Time - UTC+05:30',
    shortLabel: 'SLST (UTC+05:30)',
    offset: '+05:30',
    group: 'India & South Asia',
  },

  // Universal
  {
    value: 'UTC',
    label: '🌐 UTC (Coordinated Universal Time) - UTC+00:00',
    shortLabel: 'UTC+00:00',
    offset: '+00:00',
    group: 'Universal',
  },

  // Americas
  {
    value: 'America/New_York',
    label: '🇺🇸 US Eastern Time (ET) - New York',
    shortLabel: 'ET (New York)',
    offset: '-05:00',
    group: 'Americas',
  },
  {
    value: 'America/Chicago',
    label: '🇺🇸 US Central Time (CT) - Chicago',
    shortLabel: 'CT (Chicago)',
    offset: '-06:00',
    group: 'Americas',
  },
  {
    value: 'America/Denver',
    label: '🇺🇸 US Mountain Time (MT) - Denver',
    shortLabel: 'MT (Denver)',
    offset: '-07:00',
    group: 'Americas',
  },
  {
    value: 'America/Los_Angeles',
    label: '🇺🇸 US Pacific Time (PT) - Los Angeles',
    shortLabel: 'PT (Los Angeles)',
    offset: '-08:00',
    group: 'Americas',
  },

  // Europe & Middle East
  {
    value: 'Europe/London',
    label: '🇬🇧 UK Time (GMT/BST) - London',
    shortLabel: 'London',
    offset: '+00:00',
    group: 'Europe & Middle East',
  },
  {
    value: 'Europe/Paris',
    label: '🇪🇺 Central European Time (CET) - Paris',
    shortLabel: 'Paris / CET',
    offset: '+01:00',
    group: 'Europe & Middle East',
  },
  {
    value: 'Asia/Dubai',
    label: '🇦🇪 Gulf Standard Time (GST) - Dubai',
    shortLabel: 'GST (Dubai, UTC+04:00)',
    offset: '+04:00',
    group: 'Europe & Middle East',
  },

  // Asia & Pacific
  {
    value: 'Asia/Singapore',
    label: '🇸🇬 Singapore Standard Time (SGT) - UTC+08:00',
    shortLabel: 'SGT (Singapore)',
    offset: '+08:00',
    group: 'Asia & Pacific',
  },
  {
    value: 'Asia/Tokyo',
    label: '🇯🇵 Japan Standard Time (JST) - Tokyo',
    shortLabel: 'JST (Tokyo, UTC+09:00)',
    offset: '+09:00',
    group: 'Asia & Pacific',
  },
  {
    value: 'Australia/Sydney',
    label: '🇦🇺 Australian Eastern Time (AET) - Sydney',
    shortLabel: 'AET (Sydney)',
    offset: '+10:00',
    group: 'Asia & Pacific',
  },
];

/**
 * Normalizes timezone strings (e.g. "IST" -> "Asia/Kolkata")
 */
export function normalizeTimezone(tz?: string): string {
  if (!tz) return 'UTC';
  const clean = tz.trim();
  if (clean === 'IST' || clean.toLowerCase() === 'india' || clean === 'Asia/Calcutta') {
    return 'Asia/Kolkata';
  }
  return clean;
}

export function isIndianTimezone(tz?: string): boolean {
  const norm = normalizeTimezone(tz);
  return norm === 'Asia/Kolkata' || norm === 'IST' || norm === 'Asia/Calcutta';
}

/**
 * Returns human friendly label for a timezone
 */
export function getTimezoneLabel(tz?: string): string {
  const norm = normalizeTimezone(tz);
  const found = TIMEZONE_OPTIONS.find((t) => t.value === norm);
  if (found) return found.label;
  if (norm === 'Asia/Kolkata') return '🇮🇳 India Standard Time (IST) - UTC+05:30';
  return norm;
}

/**
 * Returns short badge label e.g. "IST (UTC+05:30)" or "UTC"
 */
export function getTimezoneShortLabel(tz?: string): string {
  const norm = normalizeTimezone(tz);
  const found = TIMEZONE_OPTIONS.find((t) => t.value === norm);
  if (found) return found.shortLabel;
  if (norm === 'Asia/Kolkata') return 'IST (UTC+05:30)';
  return norm;
}

/**
 * Formats a Date or ISO string in the specified timezone
 */
export function formatInTimezone(
  dateInput: Date | string,
  timezone: string = 'UTC',
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const safeTz = normalizeTimezone(timezone);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: safeTz,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options,
  };

  try {
    return new Intl.DateTimeFormat('en-US', defaultOptions).format(date);
  } catch {
    // Fallback if invalid timezone passed
    return new Intl.DateTimeFormat('en-US', { ...defaultOptions, timeZone: 'UTC' }).format(date);
  }
}

/**
 * Returns the current time formatted in a given timezone (e.g., "03:45 PM IST")
 */
export function getCurrentTimeInZone(timezone: string = 'Asia/Kolkata'): string {
  const safeTz = normalizeTimezone(timezone);
  try {
    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(new Date());

    const abbr = safeTz === 'Asia/Kolkata' ? 'IST' : safeTz;
    return `${timeStr} ${abbr}`;
  } catch {
    return new Date().toLocaleTimeString();
  }
}
