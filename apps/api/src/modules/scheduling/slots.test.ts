import { cairoToInstant, formatCairoTime } from '@sabeq/utils';
import { describe, expect, it } from 'vitest';
import { dayWindows, nextSlot, rulesProblem, slotsByDay, type Rule } from './slots.js';

// Sunday 11 Oct 2026, 08:00 Cairo (winter time from 30 Oct; still summer here: UTC+3).
const NOW = cairoToInstant('2026-10-11', 8 * 60);
const EVENINGS: Rule[] = [0, 2, 4].map((weekday) => ({
  weekday,
  startMinute: 18 * 60,
  endMinute: 21 * 60,
}));
const times = (d: { slots: Date[] } | undefined) => (d?.slots ?? []).map(formatCairoTime);

describe('slots', () => {
  it('fills each window with 30-minute starts that fit the session', () => {
    const days = slotsByDay({
      now: NOW,
      durationMin: 45,
      rules: EVENINGS,
      exceptions: [],
      busy: [],
      days: 7,
    });
    // Sunday: 12 hours' notice from 08:00 leaves only the 20:00 start.
    expect(times(days[0])).toEqual(['8:00 م']);
    expect(times(days[1])).toEqual([]); // Monday: no hours
    expect(times(days[2])).toEqual(['6:00 م', '6:30 م', '7:00 م', '7:30 م', '8:00 م']);
    // A 60-minute session still fits at 20:00 (ends 21:00).
    const long = slotsByDay({
      now: NOW,
      durationMin: 60,
      rules: EVENINGS,
      exceptions: [],
      busy: [],
      days: 3,
    });
    expect(times(long[2])).toEqual(['6:00 م', '6:30 م', '7:00 م', '7:30 م', '8:00 م']);
    const ninety = slotsByDay({
      ...{ now: NOW, rules: EVENINGS, exceptions: [], busy: [] },
      durationMin: 90,
      days: 3,
    });
    expect(times(ninety[2])).toEqual(['6:00 م', '6:30 م', '7:00 م', '7:30 م']);
  });

  it('respects blocked days, blocked hours and extra hours', () => {
    expect(
      dayWindows('2026-10-13', EVENINGS, [
        { date: '2026-10-13', kind: 'blocked', startMinute: null, endMinute: null },
      ]),
    ).toEqual([]);
    expect(
      dayWindows('2026-10-13', EVENINGS, [
        { date: '2026-10-13', kind: 'blocked', startMinute: 19 * 60, endMinute: 20 * 60 },
      ]),
    ).toEqual([
      { start: 18 * 60, end: 19 * 60 },
      { start: 20 * 60, end: 21 * 60 },
    ]);
    expect(
      dayWindows('2026-10-12', EVENINGS, [
        { date: '2026-10-12', kind: 'extra', startMinute: 10 * 60, endMinute: 12 * 60 },
      ]),
    ).toEqual([{ start: 10 * 60, end: 12 * 60 }]);
  });

  it('never offers time that is already booked', () => {
    const busy = [
      {
        startsAt: cairoToInstant('2026-10-13', 19 * 60),
        endsAt: cairoToInstant('2026-10-13', 19 * 60 + 45),
      },
    ];
    const days = slotsByDay({
      now: NOW,
      durationMin: 45,
      rules: EVENINGS,
      exceptions: [],
      busy,
      days: 3,
    });
    // 18:30 would end 19:15 and 19:00/19:30 overlap; 18:00 ends exactly at 18:45.
    expect(times(days[2])).toEqual(['6:00 م', '8:00 م']);
  });

  it('keeps Cairo wall-clock hours across the end of daylight saving time', () => {
    const late = slotsByDay({
      now: cairoToInstant('2026-10-28', 8 * 60),
      durationMin: 45,
      rules: EVENINGS,
      exceptions: [],
      busy: [],
      days: 14,
    });
    const before = late.find((d) => d.date === '2026-10-29');
    const after = late.find((d) => d.date === '2026-11-05');
    expect(times(before)[0]).toBe('6:00 م');
    expect(times(after)[0]).toBe('6:00 م');
    expect(before?.slots[0]?.getUTCHours()).not.toBe(after?.slots[0]?.getUTCHours());
  });

  it('finds the next slot', () => {
    expect(
      nextSlot({
        now: NOW,
        durationMin: 45,
        rules: EVENINGS,
        exceptions: [],
        busy: [],
      })?.toISOString(),
    ).toBe(cairoToInstant('2026-10-11', 20 * 60).toISOString());
    expect(nextSlot({ now: NOW, durationMin: 45, rules: [], exceptions: [], busy: [] })).toBeNull();
  });
});

describe('weekly hours validation', () => {
  it('accepts clean ranges and explains bad ones', () => {
    expect(rulesProblem(EVENINGS)).toBeNull();
    expect(rulesProblem([{ weekday: 1, startMinute: 18 * 60 + 15, endMinute: 20 * 60 }])).toContain(
      'النص',
    );
    expect(rulesProblem([{ weekday: 1, startMinute: 18 * 60, endMinute: 18 * 60 + 30 }])).toContain(
      '45',
    );
    expect(
      rulesProblem([
        { weekday: 1, startMinute: 18 * 60, endMinute: 20 * 60 },
        { weekday: 1, startMinute: 19 * 60, endMinute: 21 * 60 },
      ]),
    ).toContain('متداخلين');
  });
});
