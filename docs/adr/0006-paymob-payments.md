# 0006 — Paymob for payments

**Context.** The design offers card, mobile wallet and Fawry/kiosk payment.

**Decision (product owner, 2026-10-06).** Paymob covers all three in Egypt. It sits behind a `PaymentProvider` interface in `apps/api/src/providers/payments`. A payment counts as successful **only** when the API receives and verifies the Paymob webhook (HMAC). The browser redirect is never trusted. Webhooks are idempotent, stored by provider transaction id.

**Consequences.** A booking stays `pending` until the webhook arrives. Kiosk payments can take hours, so the kiosk slot hold is longer and expiry is handled by a background job.
