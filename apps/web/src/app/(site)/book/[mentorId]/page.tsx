import { SESSION_KINDS, type SessionKind } from '@sabeq/types';
import { EmptyState } from '@sabeq/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getAvailabilityServer } from '@/lib/availability';
import { getMentorProfile } from '@/lib/mentors';
import { BookingFlow } from './BookingFlow';

export const metadata: Metadata = {
  title: 'حجز جلسة',
  robots: { index: false, follow: false },
};

/** Booking (Phase 15): the mentor and their slots from the API; `?kind=&at=` come from the profile. */
export default async function BookPage({ params, searchParams }: PageProps<'/book/[mentorId]'>) {
  await connection();
  const slug = (await params).mentorId;
  const sp = await searchParams;
  const asKind = typeof sp.kind === 'string' ? sp.kind : '';
  const kind: SessionKind = (SESSION_KINDS as readonly string[]).includes(asKind)
    ? (asKind as SessionKind)
    : 'consultation';
  const at = typeof sp.at === 'string' && !Number.isNaN(Date.parse(sp.at)) ? sp.at : null;

  const [m, availability] = await Promise.all([
    getMentorProfile(slug),
    getAvailabilityServer(slug, kind).catch(() => null),
  ]);
  if (!m) notFound();

  const hasSlots = availability?.days.some((d) => d.slots.length);
  if (!m.acceptsBookings || !m.offerings.length || (!hasSlots && kind === 'consultation')) {
    const first = m.name.split(' ')[0];
    return (
      <section className="sb-container page-body" style={{ maxWidth: 720, paddingTop: 48 }}>
        <div className="sb-card">
          <EmptyState
            roomy
            title={`مفيش مواعيد متاحة لـ ${first} دلوقتي`}
            description="احفظه من ملفه وارجعله، أو شوف مرشدين من نفس الكلية."
            actions={
              <>
                <Link
                  className="sb-btn sb-btn--primary sb-btn--sm"
                  href={`/mentors/${m.field.slug}`}
                >
                  مرشدين مشابهين
                </Link>
                <Link className="sb-btn sb-btn--secondary sb-btn--sm" href={`/mentor/${m.slug}`}>
                  رجوع للملف
                </Link>
              </>
            }
          />
        </div>
      </section>
    );
  }

  const validAt = at && availability?.days.some((d) => d.slots.includes(at)) ? at : null;
  return <BookingFlow mentor={m} initial={{ kind, at: validAt, availability }} />;
}
