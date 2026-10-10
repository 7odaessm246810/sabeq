import { describe, expect, it } from 'vitest';
import {
  addDays,
  cairoDate,
  cairoMinuteOfDay,
  cairoOffsetMinutes,
  cairoToInstant,
  formatCairoDay,
  formatCairoTime,
  formatMinuteOfDay,
  weekdayOf,
} from './time.js';

describe('Cairo time', () => {
  it('knows Egypt’s daylight saving time', () => {
    expect(cairoOffsetMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(120); // winter
    expect(cairoOffsetMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(180); // summer
  });

  it('turns a Cairo wall-clock time into the right instant all year', () => {
    expect(cairoToInstant('2026-01-15', 19 * 60).toISOString()).toBe('2026-01-15T17:00:00.000Z');
    expect(cairoToInstant('2026-07-15', 19 * 60).toISOString()).toBe('2026-07-15T16:00:00.000Z');
    expect(cairoToInstant('2026-12-31', 23 * 60 + 30).toISOString()).toBe(
      '2026-12-31T21:30:00.000Z',
    );
  });

  it('reads instants back as Cairo dates and times', () => {
    const at = new Date('2026-10-14T22:30:00Z'); // after midnight in Cairo
    expect(cairoDate(at)).toBe('2026-10-15');
    expect(cairoMinuteOfDay(cairoToInstant('2026-10-15', 19 * 60))).toBe(19 * 60);
    expect(formatCairoTime(cairoToInstant('2026-10-15', 19 * 60))).toBe('7:00 م');
    expect(formatCairoTime(cairoToInstant('2026-10-15', 9 * 60 + 30))).toBe('9:30 ص');
    expect(formatMinuteOfDay(0)).toBe('12:00 ص');
    expect(formatMinuteOfDay(12 * 60)).toBe('12:00 م');
  });

  it('counts days and weekdays (0 = Sunday)', () => {
    expect(weekdayOf('2026-10-11')).toBe(0);
    expect(weekdayOf('2026-10-17')).toBe(6);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    const now = new Date('2026-10-14T10:00:00Z');
    expect(formatCairoDay(cairoToInstant('2026-10-14', 20 * 60), now)).toBe('النهارده');
    expect(formatCairoDay(cairoToInstant('2026-10-15', 20 * 60), now)).toBe('بكرة');
    expect(formatCairoDay(cairoToInstant('2026-10-17', 20 * 60), now)).toBe('السبت 17 أكتوبر');
  });
});
