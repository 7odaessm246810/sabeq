# 0017 — Email + password or Google; admins add an authenticator app

Supersedes [0005](0005-phone-otp-authentication.md) and [0011](0011-sms-provider.md).

**Context.** Phone + OTP needed a paid SMS provider (no contract yet, a cost per message, SMS-pumping risk) and was the last external dependency blocking launch. The product owner asked for email + password, "sign in with Google", and a sign-up form with the person's details (2026-10-11).

**Decision (product owner, 2026-10-11).**

- **Website.** Sign up with name + email + password (account type picked on the form), or with Google. The email is the login, stored lowercase. A password account gets a confirmation link (Resend) and **cannot book or pay until the email is confirmed** (`EMAIL_UNVERIFIED`, 403). Google accounts are confirmed from the start.
- **Passwords.** scrypt (N=2^15, r=8, p=3), parameters stored with the hash and upgraded on sign-in. At least 8 characters. Wrong email and wrong password get the same answer and take the same time. 30 attempts per IP per 15 minutes; 10 wrong passwords lock the account for the hour.
- **Forgot password.** A signed link (1 hour) bound to the current password hash and email, so it works once and needs no storage. Setting the password confirms the email and signs out every device. Same answer whether the email exists or not.
- **Google.** OpenID Connect code flow with PKCE, nonce and state in a signed 10-minute cookie. Only Google-verified emails. Signing in with Google links to an existing account with the same email; if that email was never confirmed, the old password is dropped and its sessions ended (whoever registered someone else's address loses the way in). Admin emails never sign in with Google.
- **Admins.** Email + password, then a 6-digit TOTP code (RFC 6238) from an authenticator app — set up from a QR code on the first sign-in. The secret is encrypted with the document keys; a code is never accepted twice. Accounts come only from `pnpm admin:create`, which emails a link to choose the password; running it again for an existing admin resets the password and the app (lost phone).
- **Phone.** An optional profile field (mentors give it in the application, for the review call); no longer an identity.

**Until a domain is bought (2026-10-11).** No Resend yet, so `AUTH_EMAIL_CONFIRMATION` defaults to off whenever `EMAIL_PROVIDER` is not `resend`: sign-up sends no link, booking does not wait for confirmation, and the site hides "forgot password" (`/auth/providers` → `emailLinks: false`). Turning on Resend turns all of it back on.

**Consequences.** No SMS provider is needed for launch. Resend with a verified domain becomes required before real users (staging can use Resend's test sender). `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are optional; without them the Google button is hidden. Sessions are unchanged (ADR-0015).
