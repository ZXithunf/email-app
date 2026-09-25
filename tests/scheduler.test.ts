import { describe, it, expect } from 'vitest';
import { calculateNextSendAt, formatMonthlyCycleKey } from '../src/services/campaignService';
import {
  normalizeTimezone,
  isIndianTimezone,
  formatInTimezone,
  getTimezoneLabel,
  getTimezoneShortLabel,
} from '../src/utils/timezoneUtils';

describe('Scheduler & Deduplication Unit Tests', () => {
  it('formats month cycle key reliably (YYYY-MM)', () => {
    const testDate = new Date('2026-09-24T12:00:00Z');
    const cycle = formatMonthlyCycleKey(testDate);
    expect(cycle).toBe('2026-09');
  });

  it('calculates next monthly send date correctly', () => {
    const nextDateStr = calculateNextSendAt(15, '10:00');
    const nextDate = new Date(nextDateStr);

    expect(nextDate.getDate()).toBe(15);
    expect(nextDate.getHours()).toBe(10);
    expect(nextDate.getMinutes()).toBe(0);
    // Must be in future
    expect(nextDate.getTime()).toBeGreaterThan(Date.now() - 60000);
  });

  describe('Indian Standard Time (IST) Support', () => {
    it('correctly normalizes IST and Indian timezone identifiers', () => {
      expect(normalizeTimezone('IST')).toBe('Asia/Kolkata');
      expect(normalizeTimezone('Asia/Calcutta')).toBe('Asia/Kolkata');
      expect(normalizeTimezone('india')).toBe('Asia/Kolkata');
      expect(normalizeTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
      expect(normalizeTimezone('UTC')).toBe('UTC');
    });

    it('identifies Indian timezones reliably', () => {
      expect(isIndianTimezone('Asia/Kolkata')).toBe(true);
      expect(isIndianTimezone('IST')).toBe(true);
      expect(isIndianTimezone('Asia/Calcutta')).toBe(true);
      expect(isIndianTimezone('UTC')).toBe(false);
      expect(isIndianTimezone('America/New_York')).toBe(false);
    });

    it('formats dates accurately in Indian Standard Time (UTC+05:30)', () => {
      // 2026-10-15 03:30:00 UTC is 2026-10-15 09:00:00 AM IST
      const utcIso = '2026-10-15T03:30:00.000Z';
      const formatted = formatInTimezone(utcIso, 'Asia/Kolkata');
      expect(formatted).toContain('Oct 15, 2026');
      expect(formatted).toContain('09:00');
    });

    it('calculates next send date respecting Indian Standard Time', () => {
      // From fixed point: 2026-10-01 00:00:00 UTC
      const fromDate = new Date('2026-10-01T00:00:00.000Z');
      const nextSendAt = calculateNextSendAt(10, '14:30', fromDate, 'Asia/Kolkata');
      const target = new Date(nextSendAt);

      // Verify formatted in Asia/Kolkata matches day 10, 14:30
      const istFormatted = formatInTimezone(target, 'Asia/Kolkata');
      expect(istFormatted).toContain('Oct 10, 2026');
      expect(istFormatted).toContain('02:30 PM');
    });

    it('returns user-friendly labels for IST', () => {
      expect(getTimezoneLabel('Asia/Kolkata')).toContain('India Standard Time');
      expect(getTimezoneShortLabel('Asia/Kolkata')).toBe('IST (UTC+05:30)');
      expect(getTimezoneShortLabel('IST')).toBe('IST (UTC+05:30)');
    });
  });
});

