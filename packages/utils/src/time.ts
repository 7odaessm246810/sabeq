/**
 * Cairo wall-clock time ↔ instants. Mentors set their hours in Cairo time («من 7 لـ 9 بالليل»);
 * bookings are stored as UTC instants. Egypt observes daylight saving time (since 2023), so the
 * offset is +2 or +3 depending on the date — always ask the time-zone database, never assume.
 *
 * Weekdays follow JavaScript and PostgreSQL: 0 = Sunday … 6 = Saturday.
 */

export const CAIRO_TZ = 'Africa/Cairo';

const parts = new Intl.DateTimeFormat('en-US', {
  timeZone: CAIRO_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Cairo's offset from UTC, in minutes, at that instant (+120 or +180). */
export function cairoOffsetMinutes(at: Date): number {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The Cairo calendar date of an instant, as YYYY-MM-DD. */
export function cairoDate(at: Date): string {
  const p = Object.fromEntries(parts.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since Cairo midnight of an instant. */
export function cairoMinuteOfDay(at: Date): number {
  return (Math.floor(at.getTime() / 60_000) + cairoOffsetMinutes(at)) % 1440;
}

/** Weekday (0 = Sunday) of a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** YYYY-MM-DD + n days. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

/**
 * The instant of a Cairo wall-clock time («2026-10-15», 19:00 → 16:00Z in winter, 15:00Z in
 * summer). The offset is looked up at the target instant, refined once for days when it changes.
 */
export function cairoToInstant(date: string, minuteOfDay: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, minuteOfDay);
  let guess = wall - cairoOffsetMinutes(new Date(wall)) * 60_000;
  guess = wall - cairoOffsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess);
}

/** «7:00 م» — the design's time format, Cairo time. */
export function formatCairoTime(at: Date): string {
  const minutes = cairoMinuteOfDay(at);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}

/** «7:00 م» for a minute of the day (availability editors). */
export function formatMinuteOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
}

export const WEEKDAY_NAMES = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

/** «النهارده» / «بكرة» / «الخميس 15 أكتوبر», relative to `now`, in Cairo. */
export function formatCairoDay(at: Date, now: Date = new Date()): string {
  const day = cairoDate(at);
  const today = cairoDate(now);
  if (day === today) return 'النهارده';
  if (day === addDays(today, 1)) return 'بكرة';
  const [, m, d] = day.split('-').map(Number);
  const months = [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'مايو',
    'يونيو',
    'يوليو',
    'أغسطس',
    'سبتمبر',
    'أكتوبر',
    'نوفمبر',
    'ديسمبر',
  ];
  return `${WEEKDAY_NAMES[weekdayOf(day)]} ${d} ${months[(m ?? 1) - 1]}`;
}
