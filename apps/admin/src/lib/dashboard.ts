/** The admin dashboard (Phase 20): numbers, bookings, reviews, accounts and mentor payouts. */
import { BOOKING_STATUS_LABELS, PAYOUT_METHOD_LABELS, type PayoutMethod } from '@sabeq/types';
import { api } from './api';
import type { PageInfo } from './verification';

export { BOOKING_STATUS_LABELS, PAYOUT_METHOD_LABELS };

export interface Overview {
  people: { students: number; mentorsListed: number; applicationsWaiting: number };
  sessions: {
    upcoming: number;
    today: number;
    bookedThisMonth: number;
    completedThisMonth: number;
  };
  money: {
    paidThisMonthEgp: number;
    refundedThisMonthEgp: number;
    keptThisMonthEgp: number;
    owedToMentorsEgp: number;
    refundsPending: number;
  };
  reviewsHidden: number;
}
export const getOverview = () => api<Overview>('/admin/overview');

// ---------- bookings ----------

export type BookingStatus = keyof typeof BOOKING_STATUS_LABELS;

export interface BookingRow {
  id: string;
  label: string;
  status: BookingStatus;
  startsAt: string;
  totalEgp: number;
  student: string;
  mentor: string;
  payment: string | null;
}

export interface BookingDetail {
  id: string;
  label: string;
  durationMin: number;
  medium: 'video' | 'audio';
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  priceEgp: number;
  feeEgp: number;
  totalEgp: number;
  commissionBps: number;
  note: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelledBy: { name: string | null; role: string } | null;
  refundShareBps: number | null;
  completedAt: string | null;
  student: { id: string; name: string | null; phone: string };
  mentor: { id: string; slug: string; name: string | null; phone: string };
  meeting: {
    provider: string;
    studentJoinedAt: string | null;
    mentorJoinedAt: string | null;
  } | null;
  payments: {
    id: string;
    method: string;
    status: string;
    amountEgp: number;
    failureReason: string | null;
    providerTxnId: string | null;
    createdAt: string;
    refunds: { amountEgp: number; status: string; createdAt: string }[];
  }[];
  review: { id: string; rating: number; text: string | null; status: string } | null;
  ledger: { type: string; amountEgp: number; createdAt: string }[];
}

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

export const listBookings = (q: { status?: string; q?: string; page: number }) =>
  api<{ items: BookingRow[]; page: PageInfo }>(`/admin/bookings?${qs(q)}`);
export const getBooking = (id: string) =>
  api<{ booking: BookingDetail }>(`/admin/bookings/${id}`).then((d) => d.booking);
export const refundBooking = (id: string, reason: string) =>
  api<{ booking: BookingDetail }>(`/admin/bookings/${id}/refund`, {
    method: 'POST',
    body: { reason },
  }).then((d) => d.booking);

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'مستني',
  succeeded: 'اتدفع',
  failed: 'فشل',
  refunded: 'اترجع',
  partially_refunded: 'اترجع جزء',
};
export const LEDGER_LABELS: Record<string, string> = {
  mentor_earning: 'مكسب المرشد',
  refund_reversal: 'اتشال بسبب استرداد',
  payout: 'اتحوّل للمرشد',
  platform_fee: 'عمولة سابق',
};

// ---------- reviews ----------

export interface ReviewRow {
  id: string;
  rating: number;
  text: string | null;
  status: 'published' | 'hidden' | 'flagged';
  createdAt: string;
  bookingId: string;
  student: string;
  mentor: string;
  mentorSlug: string;
}
export const listReviews = (q: { status?: string; page: number }) =>
  api<{ items: ReviewRow[]; page: PageInfo }>(`/admin/reviews?${qs(q)}`);
export const setReviewStatus = (id: string, status: 'published' | 'hidden', note: string) =>
  api(`/admin/reviews/${id}/status`, { method: 'POST', body: { status, note } });

// ---------- accounts ----------

export interface UserRow {
  id: string;
  name: string | null;
  phone: string;
  role: 'student' | 'mentor';
  status: 'active' | 'suspended';
  createdAt: string;
  emailConfirmed: boolean;
  mentor: { slug: string; listed: boolean } | null;
  bookings: number;
}
export const listUsers = (q: { q?: string; role?: string; status?: string; page: number }) =>
  api<{ items: UserRow[]; page: PageInfo }>(`/admin/users?${qs(q)}`);
export const setUserStatus = (id: string, status: 'active' | 'suspended', note: string) =>
  api(`/admin/users/${id}/status`, { method: 'POST', body: { status, note } });

// ---------- payouts ----------

export interface BalanceRow {
  mentorId: string;
  slug: string;
  name: string;
  phone: string;
  balanceEgp: number;
  account: { method: PayoutMethod; display: string } | null;
  lastPaidAt: string | null;
}
export type PayoutDetails =
  | { method: 'instapay'; address: string }
  | { method: 'vodafone_cash'; phone: string }
  | { method: 'bank_transfer'; bankName: string; accountHolder: string; accountNumber: string };

export interface PayoutRow {
  id: string;
  mentor: string;
  slug: string;
  amountEgp: number;
  method: PayoutMethod;
  status: string;
  reference: string | null;
  paidAt: string | null;
  by: string | null;
}

export const listBalances = () =>
  api<{ mentors: BalanceRow[] }>('/admin/payouts/balances').then((d) => d.mentors);
export const revealPayoutAccount = (mentorId: string) =>
  api<{ details: PayoutDetails }>(`/admin/payouts/accounts/${mentorId}`).then((d) => d.details);
export const recordPayout = (input: { mentorId: string; amountEgp: number; reference: string }) =>
  api<{ payout: { id: string; amountEgp: number; balanceEgp: number } }>('/admin/payouts', {
    method: 'POST',
    body: input,
  }).then((d) => d.payout);
export const listPayouts = (page: number) =>
  api<{ items: PayoutRow[]; page: PageInfo }>(`/admin/payouts?page=${page}`);

export const egp = (n: number) =>
  `${new Intl.NumberFormat('ar-EG-u-nu-latn', { maximumFractionDigits: 2 }).format(n)} ج.م`;
