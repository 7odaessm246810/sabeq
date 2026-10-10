import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BookingsList } from './BookingsList';

export const metadata: Metadata = { title: 'الحجوزات' };

export default function BookingsPage() {
  return (
    <Suspense fallback={<main className="adm-loading" aria-busy="true" />}>
      <BookingsList />
    </Suspense>
  );
}
