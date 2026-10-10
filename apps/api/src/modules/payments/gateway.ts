/**
 * Payment gateways behind one interface (ADR-0006).
 *
 * - `paymob`: Intention API → Unified Checkout (Paymob hosts the card / wallet / kiosk pages, so card
 *   numbers never touch Sabeq), transaction callbacks signed with HMAC, refunds by transaction id.
 * - `fake`: local development and tests. A test checkout page served by our own API posts a
 *   Paymob-shaped, HMAC-signed transaction to the same webhook handler, so the real verification
 *   and confirmation path runs end to end. Refused in production by the config.
 */
import type { Config } from '../../config/env.js';

export type PayMethod = 'card' | 'wallet' | 'kiosk';

export interface CheckoutInput {
  paymentId: string;
  amountPiasters: number;
  method: PayMethod;
  itemName: string;
  billing: { firstName: string; lastName: string; phone: string; email: string | null };
  /** Where Paymob posts the transaction (our webhook). */
  notificationUrl: string;
  /** Where the student's browser lands after paying (card / wallet). */
  redirectionUrl: string;
  /** How long the checkout may stay open, in seconds. */
  expiresInSeconds: number;
}

export interface PaymentGateway {
  readonly name: 'paymob' | 'fake';
  /** Methods this account can take (an integration id exists for each). */
  readonly methods: readonly PayMethod[];
  readonly hmacSecret: string;
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerOrderId: string }>;
  refund(input: { providerTxnId: string; amountPiasters: number }): Promise<{
    providerRefundId: string;
  }>;
}

export class GatewayError extends Error {
  override name = 'GatewayError';
}

export function createPaymobGateway(cfg: Config['payments']): PaymentGateway {
  const { secretKey, publicKey, hmacSecret, integrations, apiBase } = cfg;
  if (!secretKey || !publicKey || !hmacSecret) throw new Error('Paymob keys are missing');
  const methods = (['card', 'wallet', 'kiosk'] as const).filter((m) => integrations[m]);

  async function call<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { Authorization: `Token ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) throw new GatewayError(`Paymob ${path} → ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  return {
    name: 'paymob',
    methods,
    hmacSecret,

    async createCheckout(input) {
      const integration = integrations[input.method];
      if (!integration) throw new GatewayError(`no Paymob integration for ${input.method}`);
      const intention = await call<{ client_secret: string; intention_order_id: number }>(
        '/v1/intention/',
        {
          amount: input.amountPiasters,
          currency: 'EGP',
          payment_methods: [integration],
          items: [{ name: input.itemName, amount: input.amountPiasters, quantity: 1 }],
          billing_data: {
            first_name: input.billing.firstName,
            last_name: input.billing.lastName || input.billing.firstName,
            phone_number: input.billing.phone,
            email: input.billing.email ?? 'NA',
            country: 'EG',
            city: 'NA',
            street: 'NA',
            building: 'NA',
            floor: 'NA',
            apartment: 'NA',
          },
          special_reference: input.paymentId,
          notification_url: input.notificationUrl,
          redirection_url: input.redirectionUrl,
          expiration: input.expiresInSeconds,
        },
      );
      const qs = new URLSearchParams({ publicKey, clientSecret: intention.client_secret });
      return {
        redirectUrl: `${apiBase}/unifiedcheckout/?${qs.toString()}`,
        providerOrderId: String(intention.intention_order_id),
      };
    },

    async refund({ providerTxnId, amountPiasters }) {
      const res = await call<{ id: number; success?: boolean }>(
        '/api/acceptance/void_refund/refund',
        { transaction_id: Number(providerTxnId), amount_cents: amountPiasters },
      );
      if (res.success === false) throw new GatewayError(`refund of ${providerTxnId} declined`);
      return { providerRefundId: String(res.id) };
    },
  };
}

/** Local / test gateway: a checkout page on our own API, then a signed callback. */
export function createFakeGateway(cfg: { publicWebUrl: string }): PaymentGateway {
  return {
    name: 'fake',
    methods: ['card', 'wallet', 'kiosk'],
    hmacSecret: 'sabeq-fake-gateway-hmac',

    createCheckout(input) {
      return Promise.resolve({
        redirectUrl: `${cfg.publicWebUrl}/api/v1/payments/fake/checkout/${input.paymentId}`,
        providerOrderId: `fake-${input.paymentId}`,
      });
    },

    refund({ providerTxnId }) {
      return Promise.resolve({ providerRefundId: `fake-refund-${providerTxnId}-${Date.now()}` });
    },
  };
}
