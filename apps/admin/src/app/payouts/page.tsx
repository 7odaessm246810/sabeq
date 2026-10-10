import type { Metadata } from 'next';
import { Payouts } from './Payouts';

export const metadata: Metadata = { title: 'فلوس المرشدين' };

export default function PayoutsPage() {
  return <Payouts />;
}
