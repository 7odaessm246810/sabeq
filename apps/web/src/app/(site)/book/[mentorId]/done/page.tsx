import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { getMentorProfile } from '@/lib/mentors';
import { BookingFlow } from '../BookingFlow';

export const metadata: Metadata = {
  title: 'نتيجة الدفع',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where the gateway sends the student after checkout (Phase 16). Coming back proves nothing: the
 * flow asks the API, which confirms only on the gateway's signed callback.
 */
export default async function BookDonePage({
  params,
  searchParams,
}: PageProps<'/book/[mentorId]/done'>) {
  await connection();
  const slug = (await params).mentorId;
  const booking = (await searchParams).booking;
  if (typeof booking !== 'string' || !UUID.test(booking)) notFound();
  const m = await getMentorProfile(slug);
  if (!m) notFound();
  return (
    <BookingFlow
      mentor={m}
      initial={{ kind: 'consultation', at: null, availability: null }}
      returning={booking}
    />
  );
}
