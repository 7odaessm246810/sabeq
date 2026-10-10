/**
 * Bookable slots (Phase 14). Pure: rules + exceptions + busy time in, slots out.
 *
 * A day's open windows are the mentor's weekly hours for that weekday, minus blocked exceptions
 * (a whole day or part of it), plus extra hours added for that date. Slots start every 30 minutes
 * inside a window and must fit entirely in it. Slots too soon (minimum notice) or overlapping a
 * pending / confirmed booking are dropped — the database's `bookings_no_overlap` constraint is the
 * final guarantee that one slot is never sold twice.
 *
 * All wall-clock times are Cairo time; instants are computed per date (daylight saving).
 */
import { addDays, cairoDate, cairoToInstant, weekdayOf } from '@sabeq/utils';

export const SCHEDULING = {
  /** How far ahead students can book. */
  horizonDays: 21,
  /** The mentor needs time to prepare. */
  minNoticeHours: 12,
  /** Slots start on the hour and half hour. */
  stepMinutes: 30,
  /** «متاح الأسبوع ده». */
  weekDays: 7,
} as const;

export interface Rule {
  weekday: number;
  startMinute: number;
  endMinute: number;
}
export interface Exception {
  /** YYYY-MM-DD (Cairo). */
  date: string;
  kind: 'blocked' | 'extra';
  startMinute: number | null;
  endMinute: number | null;
}
export interface Busy {
  startsAt: Date;
  endsAt: Date;
}
interface Window {
  start: number;
  end: number;
}

function merge(windows: Window[]): Window[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const out: Window[] = [];
  for (const w of sorted) {
    const last = out.at(-1);
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

function subtract(windows: Window[], cut: Window): Window[] {
  return windows.flatMap((w) => {
    if (cut.end <= w.start || cut.start >= w.end) return [w];
    const parts: Window[] = [];
    if (cut.start > w.start) parts.push({ start: w.start, end: cut.start });
    if (cut.end < w.end) parts.push({ start: cut.end, end: w.end });
    return parts;
  });
}

/** Open windows of one date, in minutes since Cairo midnight. */
export function dayWindows(date: string, rules: readonly Rule[], exceptions: readonly Exception[]) {
  const today = exceptions.filter((e) => e.date === date);
  let windows = merge(
    rules
      .filter((r) => r.weekday === weekdayOf(date))
      .map((r) => ({ start: r.startMinute, end: r.endMinute })),
  );
  for (const e of today.filter((x) => x.kind === 'blocked')) {
    if (e.startMinute === null || e.endMinute === null) return [];
    windows = subtract(windows, { start: e.startMinute, end: e.endMinute });
  }
  const extra = today
    .filter((x) => x.kind === 'extra' && x.startMinute !== null && x.endMinute !== null)
    .map((x) => ({ start: x.startMinute ?? 0, end: x.endMinute ?? 0 }));
  return merge([...windows, ...extra]);
}

export interface SlotQuery {
  now: Date;
  durationMin: number;
  days?: number;
  rules: readonly Rule[];
  exceptions: readonly Exception[];
  busy: readonly Busy[];
}

/** Bookable start instants per Cairo date, from today for `days` days. */
export function slotsByDay(q: SlotQuery): { date: string; slots: Date[] }[] {
  const earliest = q.now.getTime() + SCHEDULING.minNoticeHours * 3_600_000;
  const today = cairoDate(q.now);
  const out: { date: string; slots: Date[] }[] = [];
  for (let i = 0; i < (q.days ?? SCHEDULING.horizonDays); i++) {
    const date = addDays(today, i);
    const slots: Date[] = [];
    for (const w of dayWindows(date, q.rules, q.exceptions)) {
      for (let m = w.start; m + q.durationMin <= w.end; m += SCHEDULING.stepMinutes) {
        const start = cairoToInstant(date, m);
        const end = start.getTime() + q.durationMin * 60_000;
        if (start.getTime() < earliest) continue;
        if (q.busy.some((b) => start < b.endsAt && end > b.startsAt.getTime())) continue;
        slots.push(start);
      }
    }
    out.push({ date, slots });
  }
  return out;
}

/** The first bookable slot within `days`, or null. */
export function nextSlot(q: SlotQuery): Date | null {
  for (const d of slotsByDay(q)) if (d.slots[0]) return d.slots[0];
  return null;
}

/**
 * Validates a mentor's weekly hours: 30-minute steps, at least 45 minutes long (the shortest full
 * session), at most 4 ranges a day, no overlaps. Returns an Arabic message or null.
 */
export function rulesProblem(rules: readonly Rule[]): string | null {
  for (const r of rules) {
    if (r.startMinute % SCHEDULING.stepMinutes || r.endMinute % SCHEDULING.stepMinutes)
      return 'المواعيد بتبدأ وتخلص على الساعة أو النص.';
    if (r.endMinute - r.startMinute < 45) return 'كل فترة لازم تكون 45 دقيقة على الأقل.';
  }
  for (let d = 0; d < 7; d++) {
    const day = rules.filter((r) => r.weekday === d).sort((a, b) => a.startMinute - b.startMinute);
    if (day.length > 4) return 'أقصى حاجة 4 فترات في اليوم.';
    for (let i = 1; i < day.length; i++) {
      const prev = day[i - 1];
      const cur = day[i];
      if (prev && cur && cur.startMinute < prev.endMinute)
        return 'في فترتين متداخلين في نفس اليوم.';
    }
  }
  return null;
}
