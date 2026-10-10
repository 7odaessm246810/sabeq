'use client';

import { formatCairoDay, formatCairoTime } from '@sabeq/utils';
import { Icon, Modal } from '@sabeq/ui';
import Link from 'next/link';
import { useState } from 'react';
import type { Availability } from '@/lib/availability';
import { nextSlotLabel, type MentorProfileData } from '@/lib/mentors';

/**
 * The profile's booking box (design «profile» / «profile-unavailable»), with real slots (Phase 14).
 * Booking itself opens with Phase 15; until then the chosen slot is shown but not sold.
 */
export function BookingBox({
  mentor: m,
  availability,
  saved,
  onSave,
}: {
  mentor: MentorProfileData;
  availability: Availability | null;
  saved: boolean;
  onSave: () => void;
}) {
  const first = m.name.split(' ')[0] ?? m.name;
  const base = m.offerings.find((o) => o.kind === 'consultation');
  const slots = availability?.days.flatMap((d) => d.slots) ?? [];
  const quick = slots.slice(0, 3);
  const [picked, setPicked] = useState(quick[0] ?? null);
  const [all, setAll] = useState(false);
  const days = availability?.days.filter((d) => d.slots.length) ?? [];

  return (
    <div className="sb-card book-box">
      {base ? (
        <div className="sb-price" style={{ margin: 0 }}>
          <b>
            <span className="sb-num">{base.priceEgp}</span> ج.م
          </b>
          <span>
            جلسة {base.durationMin} دقيقة · {base.medium === 'video' ? 'فيديو' : 'صوت'}
          </span>
        </div>
      ) : null}
      {m.offerings.length > 1 ? (
        <ul className="prof-offers">
          {m.offerings
            .filter((o) => o.kind !== 'consultation')
            .map((o) => (
              <li key={o.kind}>
                <span>
                  {o.label} · {o.durationMin} دقيقة
                </span>
                <b>
                  <span className="sb-num">{o.priceEgp}</span> ج.م
                </b>
              </li>
            ))}
        </ul>
      ) : null}

      {quick.length && picked ? (
        <>
          <span className="sb-status sb-status--on">
            <span className="sb-dot" />
            {nextSlotLabel(quick[0] ?? picked)}
          </span>
          <b style={{ fontSize: 14 }}>مواعيد قريبة</b>
          <div className="quick" role="radiogroup" aria-label="مواعيد قريبة">
            {quick.map((s) => (
              <button
                key={s}
                type="button"
                className="sb-slot"
                role="radio"
                aria-checked={s === picked}
                aria-pressed={s === picked}
                onClick={() => setPicked(s)}
              >
                <span>{formatCairoDay(new Date(s))}</span> · {formatCairoTime(new Date(s))}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
            disabled
            aria-describedby="book-soon"
          >
            احجز الموعد ده
          </button>
          <span className="sb-caption" id="book-soon" style={{ textAlign: 'center' }}>
            الحجز والدفع أونلاين بيفتحوا قريب. احفظ {first} عشان ترجعله.
          </span>
          <button
            type="button"
            className="sb-btn sb-btn--ghost sb-btn--block"
            onClick={() => setAll(true)}
          >
            كل المواعيد
          </button>
        </>
      ) : (
        <>
          <span className="sb-status sb-status--off">
            <span className="sb-dot" />
            {m.acceptsBookings
              ? 'لا توجد مواعيد الأسابيع الجاية'
              : `${first} مش بياخد حجوزات دلوقتي`}
          </span>
          <button
            type="button"
            className="sb-btn sb-btn--secondary sb-btn--block"
            aria-pressed={saved}
            disabled={saved}
            onClick={onSave}
          >
            {saved ? 'محفوظ — هتلاقيه في جلساتي' : 'احفظه وارجعله بعدين'}
          </button>
          <Link
            className="sb-btn sb-btn--link"
            href={`/mentors/${m.field.slug}`}
            style={{ alignSelf: 'center', fontSize: 14 }}
          >
            مرشدين مشابهين
          </Link>
        </>
      )}
      <div className="sb-secure">
        <Icon name="lock" />
        إلغاء مجاني قبل الجلسة بـ 24 ساعة.
      </div>

      {all ? (
        <Modal
          title={`مواعيد ${first}`}
          onClose={() => setAll(false)}
          footer={
            <button type="button" className="sb-btn sb-btn--primary" onClick={() => setAll(false)}>
              تمام
            </button>
          }
        >
          <p className="sb-small" style={{ marginTop: 0 }}>
            المواعيد بتوقيت القاهرة، لجلسة {base?.durationMin ?? 45} دقيقة.
          </p>
          <div className="all-slots">
            {days.map((d) => (
              <div key={d.date}>
                <b>{formatCairoDay(new Date(d.slots[0] ?? ''))}</b>
                <div className="sb-slots">
                  {d.slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="sb-slot"
                      aria-pressed={s === picked}
                      onClick={() => {
                        setPicked(s);
                        setAll(false);
                      }}
                    >
                      {formatCairoTime(new Date(s))}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
