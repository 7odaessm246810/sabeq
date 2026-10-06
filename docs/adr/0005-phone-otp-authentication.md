# 0005 — Phone number + OTP authentication

**Context.** The design's login is phone → OTP (`screenshots/07-login`). Most users are Egyptian high-school students: almost all have a phone number, not all have an email.

**Decision (product owner, 2026-10-06).** Passwordless login with an Egyptian mobile number and a 6-digit OTP. Numbers are normalised to E.164 (`normalizeEgyptianMobile` in `@sabeq/utils`). OTPs are stored hashed in Redis with a TTL, a limited number of attempts, and per-phone and per-IP rate limits. Email is optional (receipts and notifications). Admins also need a second factor.

**Consequences.** Needs an SMS provider (ADR-0011) and a budget for SMS costs. SMS-pumping fraud must be rate-limited from day one.
