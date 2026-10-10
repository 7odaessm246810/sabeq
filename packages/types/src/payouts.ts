/** Mentor payouts (Phase 20, ADR-0009): how mentors get the money they earned. */
import type { PayoutMethod } from './statuses.js';

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  instapay: 'InstaPay',
  vodafone_cash: 'فودافون كاش',
  bank_transfer: 'تحويل بنكي',
};

/** What a mentor enters — kept encrypted; admins see it only when paying (audited). */
export type PayoutDetails =
  | { method: 'instapay'; address: string }
  | { method: 'vodafone_cash'; phone: string }
  | { method: 'bank_transfer'; bankName: string; accountHolder: string; accountNumber: string };
