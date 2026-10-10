'use client';

import {
  addDays,
  cairoDate,
  formatCairoDay,
  formatCairoTime,
  formatMinuteOfDay,
  weekdayOf,
  WEEKDAY_NAMES,
} from '@sabeq/utils';
import { Banner, EmptyState, FieldError, Icon, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Select } from '@/components/form';
import { PageHead } from '@/components/PageHead';
import { ApiError } from '@/lib/api';
import {
  addException,
  deleteException,
  getOwnAvailability,
  saveRules,
  type OwnAvailability,
  type Rule,
} from '@/lib/availability';
import { useSignedIn } from '@/lib/use-signed-in';

/** Egyptian week order: Saturday first. */
const WEEK = [6, 0, 1, 2, 3, 4, 5] as const;
/** Half-hour marks from 6:00 ص to 12:00 منتصف الليل. */
const TIMES = Array.from({ length: 37 }, (_, i) => 6 * 60 + i * 30);
const timeOptions = (list: number[]) =>
  list.map((m) => [String(m), m === 1440 ? '12:00 منتصف الليل' : formatMinuteOfDay(m)] as const);
const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حصلت مشكلة. جرّب تاني.';

/**
 * «مواعيدي» (Phase 14 — not in the design handoff; built from the account cards, slots and
 * design-system controls). Weekly hours plus date exceptions; students see slots computed from them.
 */
export function AvailabilityEditor() {
  const user = useSignedIn('/account/availability');
  const [data, setData] = useState<OwnAvailability | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'failed'>('loading');

  useEffect(() => {
    if (user?.role !== 'mentor') return;
    getOwnAvailability()
      .then((d) => {
        setData(d);
        setState('ready');
      })
      .catch((err: unknown) =>
        setState(err instanceof ApiError && err.status === 404 ? 'none' : 'failed'),
      );
  }, [user]);

  if (!user) return <div className="page-body" aria-busy="true" />;

  return (
    <>
      <PageHead
        crumbs={[
          { label: 'الرئيسية', href: '/' },
          { label: 'حسابي', href: '/account' },
          { label: 'مواعيدي' },
        ]}
      >
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">مواعيدي</h1>
            <p className="sb-lead">
              الأيام والساعات اللي تقدر تاخد فيها جلسات. كل المواعيد بتوقيت القاهرة.
            </p>
          </div>
          <Link className="sb-btn sb-btn--secondary" href="/account/mentor">
            <Icon name="user" />
            ملفي كمرشد
          </Link>
        </div>
      </PageHead>
      <section className="sb-container page-body acct">
        {user.role !== 'mentor' ? (
          <Banner kind="info" title="الصفحة دي للمرشدين">
            حسابك حساب طالب. <Link href="/become-mentor">اعرف إزاي تبقى مرشد</Link>.
          </Banner>
        ) : state === 'loading' ? (
          <div className="sb-card acct-card" aria-busy="true" style={{ minHeight: 280 }} />
        ) : state === 'none' ? (
          <Banner kind="info" title="ملفك لسه ما اتعملش">
            المواعيد بتتظبط بعد ما طلب انضمامك يتقبل.{' '}
            <Link href="/become-mentor/apply">تابع طلبك</Link>.
          </Banner>
        ) : state === 'failed' || !data ? (
          <Banner kind="error" title="حصلت مشكلة">
            ما قدرناش نجيب مواعيدك. حدّث الصفحة وجرّب تاني.
          </Banner>
        ) : (
          <>
            <Upcoming data={data} />
            <WeeklyHours key={JSON.stringify(data.rules)} data={data} onSaved={setData} />
            <Exceptions data={data} onChange={setData} />
          </>
        )}
      </section>
    </>
  );
}

function Upcoming({ data }: { data: OwnAvailability }) {
  return (
    <div className="sb-card acct-card">
      <h2 className="sb-h3">أول مواعيد هتظهر للطلبة</h2>
      {data.upcoming.length ? (
        <div className="chips-row">
          {data.upcoming.map((s) => (
            <span key={s} className="sb-chip sb-chip--sm" style={{ cursor: 'default' }}>
              {formatCairoDay(new Date(s))} · {formatCairoTime(new Date(s))}
            </span>
          ))}
        </div>
      ) : (
        <p className="sb-small">
          مفيش مواعيد ظاهرة دلوقتي. حدد أيامك وساعاتك تحت، أو اتأكد إن «باخد حجوزات دلوقتي» مفعّلة
          في <Link href="/account/mentor">ملفك</Link>.
        </p>
      )}
      <p className="sb-caption">
        الطالب يقدر يحجز قبل الجلسة بـ {data.limits.minNoticeHours} ساعة على الأقل، ولحد{' '}
        {data.limits.horizonDays} يوم قدّام. الحجوزات الموجودة مش بتتأثر لو غيّرت مواعيدك.
      </p>
    </div>
  );
}

function WeeklyHours({
  data,
  onSaved,
}: {
  data: OwnAvailability;
  onSaved: (d: OwnAvailability) => void;
}) {
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>(data.rules);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(rules) !== JSON.stringify(data.rules);

  const ofDay = (d: number) => rules.filter((r) => r.weekday === d);
  const update = (next: Rule[]) => {
    setRules(next);
    setError(null);
  };
  const setDay = (d: number, ranges: Rule[]) =>
    update([...rules.filter((r) => r.weekday !== d), ...ranges]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(await saveRules(rules));
      toast({ kind: 'success', title: 'مواعيدك اتحفظت', description: 'بتظهر للطلبة خلال دقيقة.' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sb-card acct-card" onSubmit={(e) => void save(e)}>
      <h2 className="sb-h3">الأيام والساعات كل أسبوع</h2>
      <ul className="av-week">
        {WEEK.map((d) => {
          const ranges = ofDay(d);
          return (
            <li key={d}>
              <label className="av-day">
                <input
                  type="checkbox"
                  checked={ranges.length > 0}
                  onChange={(e) =>
                    setDay(
                      d,
                      e.target.checked
                        ? [{ weekday: d, startMinute: 18 * 60, endMinute: 21 * 60 }]
                        : [],
                    )
                  }
                />
                <b>{WEEKDAY_NAMES[d]}</b>
              </label>
              {ranges.length ? (
                <div className="av-ranges">
                  {ranges.map((r, i) => (
                    <div key={i} className="av-range">
                      <Select
                        id={`r-${d}-${i}-s`}
                        value={String(r.startMinute)}
                        error={undefined}
                        options={timeOptions(TIMES.slice(0, -1))}
                        onChange={(v) =>
                          setDay(
                            d,
                            ranges.map((x, j) => (j === i ? { ...x, startMinute: Number(v) } : x)),
                          )
                        }
                      />
                      <span className="sb-small">لـ</span>
                      <Select
                        id={`r-${d}-${i}-e`}
                        value={String(r.endMinute)}
                        error={undefined}
                        options={timeOptions(TIMES.slice(1))}
                        onChange={(v) =>
                          setDay(
                            d,
                            ranges.map((x, j) => (j === i ? { ...x, endMinute: Number(v) } : x)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="sb-btn sb-btn--ghost sb-btn--sm"
                        aria-label={`شيل الفترة ${i + 1} يوم ${WEEKDAY_NAMES[d]}`}
                        onClick={() =>
                          setDay(
                            d,
                            ranges.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <Icon name="x" />
                      </button>
                    </div>
                  ))}
                  {ranges.length < 4 ? (
                    <button
                      type="button"
                      className="sb-btn sb-btn--link av-add"
                      onClick={() => {
                        const last = ranges.at(-1);
                        const start = Math.min((last?.endMinute ?? 17 * 60) + 60, 22 * 60);
                        setDay(d, [
                          ...ranges,
                          {
                            weekday: d,
                            startMinute: start,
                            endMinute: Math.min(start + 120, 1440),
                          },
                        ]);
                      }}
                    >
                      <Icon name="plus" /> فترة تانية
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="sb-small av-off">مش متاح</span>
              )}
            </li>
          );
        })}
      </ul>
      {error ? <FieldError id="rules-err">{error}</FieldError> : null}
      <div className="av-actions">
        <button
          type="submit"
          className="sb-btn sb-btn--primary"
          aria-busy={busy}
          disabled={busy || !dirty}
        >
          احفظ المواعيد
        </button>
        {dirty ? (
          <button type="button" className="sb-btn sb-btn--ghost" onClick={() => update(data.rules)}>
            رجّع زي ما كانت
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Exceptions({
  data,
  onChange,
}: {
  data: OwnAvailability;
  onChange: (d: OwnAvailability) => void;
}) {
  const toast = useToast();
  const today = cairoDate(new Date());
  const [date, setDate] = useState(addDays(today, 1));
  const [kind, setKind] = useState<'day' | 'hours' | 'extra'>('day');
  const [start, setStart] = useState(18 * 60);
  const [end, setEnd] = useState(21 * 60);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onChange(
        await addException({
          date,
          kind: kind === 'extra' ? 'extra' : 'blocked',
          startMinute: kind === 'day' ? null : start,
          endMinute: kind === 'day' ? null : end,
        }),
      );
      toast({ kind: 'success', title: 'اتضاف' });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      onChange(await deleteException(id));
      toast({ kind: 'success', title: 'اتشال' });
    } catch (err) {
      toast({ kind: 'error', title: errorText(err) });
    }
  }

  return (
    <div className="sb-card acct-card">
      <h2 className="sb-h3">إجازات ومواعيد زيادة</h2>
      <p className="sb-small">
        مسافر أو عندك امتحان؟ اقفل يوم أو ساعات معينة. فاضي يوم مش من أيامك؟ ضيف ساعات ليه بس.
      </p>
      <form className="av-exc-form" onSubmit={(e) => void add(e)}>
        <div className="sb-field">
          <label className="sb-label" htmlFor="ex-date">
            اليوم
          </label>
          <input
            id="ex-date"
            type="date"
            className="sb-input"
            value={date}
            min={today}
            max={addDays(today, 90)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="sb-field">
          <label className="sb-label" htmlFor="ex-kind">
            عايز تعمل إيه
          </label>
          <Select
            id="ex-kind"
            value={kind}
            error={undefined}
            options={[
              ['day', 'اقفل اليوم كله'],
              ['hours', 'اقفل ساعات معينة'],
              ['extra', 'ضيف ساعات اليوم ده'],
            ]}
            onChange={(v) => v && setKind(v as typeof kind)}
          />
        </div>
        {kind !== 'day' ? (
          <div className="av-range">
            <Select
              id="ex-s"
              value={String(start)}
              error={undefined}
              options={timeOptions(TIMES.slice(0, -1))}
              onChange={(v) => setStart(Number(v))}
            />
            <span className="sb-small">لـ</span>
            <Select
              id="ex-e"
              value={String(end)}
              error={undefined}
              options={timeOptions(TIMES.slice(1))}
              onChange={(v) => setEnd(Number(v))}
            />
          </div>
        ) : null}
        <button type="submit" className="sb-btn sb-btn--secondary" aria-busy={busy} disabled={busy}>
          ضيف
        </button>
      </form>
      {error ? <FieldError id="ex-err">{error}</FieldError> : null}

      {data.exceptions.length ? (
        <ul className="av-exc">
          {data.exceptions.map((x) => (
            <li key={x.id}>
              <span
                className={`sb-badge ${x.kind === 'extra' ? 'sb-badge--success' : 'sb-badge--neutral'}`}
              >
                {x.kind === 'extra' ? 'ساعات زيادة' : 'مقفول'}
              </span>
              <span>
                <b>
                  {WEEKDAY_NAMES[weekdayOf(x.date)]}{' '}
                  {x.date.split('-').reverse().slice(0, 2).join('/')}
                </b>
                <span className="sb-small">
                  {' '}
                  ·{' '}
                  {x.startMinute === null || x.endMinute === null
                    ? 'اليوم كله'
                    : `من ${formatMinuteOfDay(x.startMinute)} لـ ${formatMinuteOfDay(x.endMinute)}`}
                </span>
              </span>
              <button
                type="button"
                className="sb-btn sb-btn--ghost sb-btn--sm"
                onClick={() => void remove(x.id)}
              >
                شيل
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="مفيش إجازات أو ساعات زيادة"
          description="مواعيدك ماشية على الجدول الأسبوعي."
        />
      )}
    </div>
  );
}
