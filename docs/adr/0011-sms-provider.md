# 0011 — SMS provider for OTP

**Context.** OTP delivery must be fast and reliable on Vodafone, Orange, e& (Etisalat) and WE, and cheap at scale.

**Decision (proposed).**

- An `SmsProvider` interface with three implementations: `console` for local development, a local Egyptian aggregator as **primary** (for example Cequens or SMS Misr — registered alphanumeric sender ID `SABEQ`, local routes, usually cheaper), and **Twilio Verify** as fallback when the primary fails.
- Final choice after getting price quotes and testing delivery speed on all four networks with real numbers, before Phase 07 ends.
- Later option: WhatsApp OTP as a cheaper channel.

**Consequences.** Switching providers is a configuration change. Registering a sender ID with the Egyptian carriers takes time, so the paperwork should start early.
