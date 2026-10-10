/** The mentor's money (Phase 20): balance, payouts received, and where to send them. */
import type { PayoutDetails, PayoutMethod } from '@sabeq/types';
import { api } from './api';

export interface PayoutAccount {
  method: PayoutMethod;
  /** Masked: «فودافون كاش · •••• 5678». */
  display: string;
  updatedAt: string;
}

export interface Earnings {
  balanceEgp: number;
  earnedEgp: number;
  paidEgp: number;
  payouts: { id: string; amountEgp: number; method: PayoutMethod; status: string; date: string }[];
}

export const getPayoutAccount = () =>
  api<{ account: PayoutAccount | null }>('/me/mentor/payout-account').then((d) => d.account);
export const setPayoutAccount = (details: PayoutDetails) =>
  api<{ account: PayoutAccount }>('/me/mentor/payout-account', {
    method: 'PUT',
    body: details,
  }).then((d) => d.account);
export const getEarnings = () => api<Earnings>('/me/mentor/earnings');
