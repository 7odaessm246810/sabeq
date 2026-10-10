/**
 * Paymob transaction callback HMAC (HMAC-SHA512 with the account's HMAC secret).
 *
 * The signed string is these fields of the transaction object, in this exact order, concatenated
 * with no separator; booleans as `true` / `false`
 * (https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback).
 * Never trust a callback whose HMAC doesn't match: anyone can POST to the webhook URL.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const HMAC_FIELDS = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

/** A transaction as Paymob posts it in `obj` (only what we read). */
export interface PaymobTransaction {
  id: number;
  amount_cents: number;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  integration_id: number;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  owner: number;
  pending: boolean;
  success: boolean;
  order: { id: number; merchant_order_id?: string | null };
  source_data: { pan?: string | null; sub_type?: string | null; type?: string | null };
  data?: { message?: string; bill_reference?: string | number | null } | null;
}

function field(obj: Record<string, unknown>, path: string): string {
  let v: unknown = obj;
  for (const part of path.split('.')) v = (v as Record<string, unknown> | null)?.[part];
  if (v === null || v === undefined) return '';
  return String(v);
}

export function paymobHmac(obj: Record<string, unknown>, secret: string): string {
  const message = HMAC_FIELDS.map((f) => field(obj, f)).join('');
  return createHmac('sha512', secret).update(message).digest('hex');
}

export function verifyPaymobHmac(obj: Record<string, unknown>, given: string, secret: string) {
  const expected = Buffer.from(paymobHmac(obj, secret), 'hex');
  const actual = Buffer.from(/^[0-9a-f]{128}$/i.test(given) ? given : '', 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
