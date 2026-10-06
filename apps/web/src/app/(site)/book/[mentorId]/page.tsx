import { EmptyState } from '@sabeq/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMentor } from '@/lib/mock/data';
import { BookingFlow } from './BookingFlow';

export const metadata: Metadata = {
  title: 'حجز جلسة',
  robots: { index: false, follow: false },
};

export default async function BookPage({ params }: PageProps<'/book/[mentorId]'>) {
  const m = getMentor((await params).mentorId);
  if (!m) notFound();

  if (!m.available) {
    const first = m.name.split(' ')[0];
    return (
      <section className="sb-container page-body" style={{ maxWidth: 720, paddingTop: 48 }}>
        <div className="sb-card">
          <EmptyState
            roomy
            title={`مفيش مواعيد متاحة لـ ${first} دلوقتي`}
            description="عادةً بيفتح مواعيد كل أسبوعين. شوف مرشدين من نفس الكلية."
            actions={
              <>
                <Link className="sb-btn sb-btn--primary sb-btn--sm" href={`/mentors/${m.facId}`}>
                  مرشدين مشابهين
                </Link>
                <Link className="sb-btn sb-btn--secondary sb-btn--sm" href={`/mentor/${m.id}`}>
                  رجوع للملف
                </Link>
              </>
            }
          />
        </div>
      </section>
    );
  }

  return <BookingFlow mentor={m} />;
}
