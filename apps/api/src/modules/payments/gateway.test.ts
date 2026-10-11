import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayError, createFakeGateway, createPaymobGateway } from './gateway.js';

const cfg = {
  mode: 'paymob' as const,
  apiBase: 'https://accept.paymob.test',
  secretKey: 'sk_test',
  publicKey: 'pk_test',
  hmacSecret: 'hmac',
  integrations: { card: 111, wallet: 222 },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const checkout = {
  paymentId: '01a12688-0000-7000-8000-000000000001',
  amountPiasters: 21_500,
  method: 'wallet' as const,
  itemName: 'جلسة على سابق',
  billing: { firstName: 'سما', lastName: '', phone: '+201012345678', email: null },
  notificationUrl: 'https://sabeq.test/api/v1/payments/paymob/webhook',
  redirectionUrl: 'https://sabeq.test/book/m/done?booking=b',
  expiresInSeconds: 600,
};

afterEach(() => vi.unstubAllGlobals());

describe('Paymob gateway', () => {
  it('offers only the methods with an integration id, and refuses to start without keys', () => {
    expect(createPaymobGateway(cfg).methods).toEqual(['card', 'wallet']);
    expect(() => createPaymobGateway({ ...cfg, secretKey: undefined })).toThrow(/keys/);
  });

  it('creates an intention for the exact amount and sends the student to Unified Checkout', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ client_secret: 'cs_1', intention_order_id: 987654 }));
    vi.stubGlobal('fetch', fetch);
    const res = await createPaymobGateway(cfg).createCheckout(checkout);

    expect(res).toEqual({
      redirectUrl:
        'https://accept.paymob.test/unifiedcheckout/?publicKey=pk_test&clientSecret=cs_1',
      providerOrderId: '987654',
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://accept.paymob.test/v1/intention/');
    expect((init.headers as Record<string, string>).Authorization).toBe('Token sk_test');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      amount: 21_500,
      currency: 'EGP',
      payment_methods: [222],
      items: [{ name: 'جلسة على سابق', amount: 21_500, quantity: 1 }],
      special_reference: checkout.paymentId,
      notification_url: checkout.notificationUrl,
      redirection_url: checkout.redirectionUrl,
      expiration: 600,
    });
    // Paymob requires every billing field: blanks become NA, the last name falls back.
    expect(body.billing_data).toMatchObject({
      first_name: 'سما',
      last_name: 'سما',
      email: 'NA',
      phone_number: '+201012345678',
      country: 'EG',
    });
  });

  it('a method without an integration, or an error from Paymob, is a GatewayError', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ detail: 'invalid' }, 400));
    vi.stubGlobal('fetch', fetch);
    const paymob = createPaymobGateway(cfg);
    await expect(paymob.createCheckout({ ...checkout, method: 'kiosk' })).rejects.toBeInstanceOf(
      GatewayError,
    );
    expect(fetch).not.toHaveBeenCalled();
    await expect(paymob.createCheckout(checkout)).rejects.toThrow(/400/);
  });

  it('refunds by transaction id and amount; a declined refund throws', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ id: 555, success: true }))
      .mockResolvedValueOnce(json({ id: 556, success: false }));
    vi.stubGlobal('fetch', fetch);
    const paymob = createPaymobGateway(cfg);
    expect(await paymob.refund({ providerTxnId: '192036465', amountPiasters: 10_000 })).toEqual({
      providerRefundId: '555',
    });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://accept.paymob.test/api/acceptance/void_refund/refund');
    expect(JSON.parse(init.body as string)).toEqual({
      transaction_id: 192036465,
      amount_cents: 10_000,
    });
    await expect(paymob.refund({ providerTxnId: '1', amountPiasters: 1 })).rejects.toThrow(
      /declined/,
    );
  });
});

describe('fake gateway', () => {
  it('sends the browser to the local test checkout and refunds at once', async () => {
    const fake = createFakeGateway({ publicWebUrl: 'http://localhost:3000' });
    expect(fake.name).toBe('fake');
    const res = await fake.createCheckout(checkout);
    expect(res.redirectUrl).toBe(
      `http://localhost:3000/api/v1/payments/fake/checkout/${checkout.paymentId}`,
    );
    expect((await fake.refund({ providerTxnId: '9', amountPiasters: 1 })).providerRefundId).toMatch(
      /^fake-refund-9-/,
    );
  });
});
