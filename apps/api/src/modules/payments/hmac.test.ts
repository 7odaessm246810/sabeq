import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HMAC_FIELDS, paymobHmac, verifyPaymobHmac } from './hmac.js';

/** The sample transaction from Paymob's HMAC documentation. */
const SAMPLE = {
  amount_cents: 100000,
  created_at: '2024-06-13T11:33:44.592345',
  currency: 'EGP',
  error_occured: false,
  has_parent_transaction: false,
  id: 192036465,
  integration_id: 4097558,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 217503754 },
  owner: 302852,
  pending: false,
  source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
  success: true,
};

describe('Paymob transaction HMAC', () => {
  it('signs the 20 documented fields in order, booleans as true/false', () => {
    // The exact concatenated string Paymob's documentation shows for this sample.
    const message =
      '1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue';
    expect(HMAC_FIELDS).toHaveLength(20);
    const secret = 'test-secret';
    expect(paymobHmac(SAMPLE, secret)).toBe(
      createHmac('sha512', secret).update(message).digest('hex'),
    );
  });

  it('accepts the right signature and nothing else', () => {
    const good = paymobHmac(SAMPLE, 's3cret');
    expect(verifyPaymobHmac(SAMPLE, good, 's3cret')).toBe(true);
    expect(verifyPaymobHmac(SAMPLE, good, 'other-secret')).toBe(false);
    expect(verifyPaymobHmac({ ...SAMPLE, amount_cents: 1 }, good, 's3cret')).toBe(false);
    expect(verifyPaymobHmac({ ...SAMPLE, success: false }, good, 's3cret')).toBe(false);
    expect(verifyPaymobHmac(SAMPLE, '', 's3cret')).toBe(false);
    expect(verifyPaymobHmac(SAMPLE, 'not-hex', 's3cret')).toBe(false);
  });
});
