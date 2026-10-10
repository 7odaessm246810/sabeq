import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookingDetail } from './BookingDetail';

export const metadata: Metadata = { title: 'تفاصيل الحجز' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BookingPage({ params }: PageProps<'/bookings/[id]'>) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <BookingDetail id={id} />;
}
