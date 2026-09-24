import { describe, it, expect } from 'vitest';
import { calculateNextSendAt, formatMonthlyCycleKey } from '../src/services/campaignService';

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
});
