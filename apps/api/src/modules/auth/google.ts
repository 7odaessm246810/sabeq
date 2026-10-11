/**
 * "Sign in with Google" — OpenID Connect authorization-code flow with PKCE (ADR-0017).
 *
 *   GET /auth/google            → 302 to Google; state, nonce and the PKCE verifier ride in a signed,
 *                                 httpOnly, 10-minute cookie (nothing kept on the server).
 *   GET /auth/google/callback   → the code is exchanged server-to-server (client secret + verifier),
 *                                 then the ID token's issuer, audience, expiry and nonce are checked.
 *
 * The ID token comes straight from Google's token endpoint over TLS, which OIDC Core §3.1.3.7
 * accepts in place of checking its signature. Only addresses Google has verified are trusted.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
export const GOOGLE_STATE_SECONDS = 600;

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
}

/** The two calls that leave the API; tests replace `exchange`. */
export interface GoogleClient {
  authorizeUrl(p: {
    state: string;
    nonce: string;
    codeChallenge: string;
    redirectUri: string;
  }): string;
  /** The ID token's claims, unchecked. */
  exchange(p: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<Record<string, unknown>>;
}

export class GoogleAuthError extends Error {
  override name = 'GoogleAuthError';
}

export function createGoogleClient(cfg: { clientId: string; clientSecret: string }): GoogleClient {
  return {
    authorizeUrl({ state, nonce, codeChallenge, redirectUri }) {
      const q = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });
      return `${AUTHORIZE_URL}?${q.toString()}`;
    },

    async exchange({ code, codeVerifier, redirectUri }) {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id_token?: unknown; error?: unknown };
      if (!res.ok || typeof body.id_token !== 'string')
        throw new GoogleAuthError(`token exchange → ${res.status} ${String(body.error ?? '')}`);
      const payload = body.id_token.split('.')[1];
      if (!payload) throw new GoogleAuthError('malformed id_token');
      return JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>;
    },
  };
}

/** Issuer, audience, expiry, nonce and a verified email — or GoogleAuthError. */
export function checkIdToken(
  claims: Record<string, unknown>,
  expect: { clientId: string; nonce: string; nowMs: number },
): GoogleIdentity {
  const fail = (why: string): never => {
    throw new GoogleAuthError(why);
  };
  if (typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss)) fail('issuer');
  const aud = claims.aud;
  if (!(aud === expect.clientId || (Array.isArray(aud) && aud.includes(expect.clientId))))
    fail('audience');
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= expect.nowMs) fail('expired');
  if (claims.nonce !== expect.nonce) fail('nonce');
  if (typeof claims.sub !== 'string' || !claims.sub) fail('subject');
  if (typeof claims.email !== 'string' || claims.email_verified !== true)
    fail('email not verified');
  const name =
    typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 120) : null;
  return { sub: claims.sub as string, email: (claims.email as string).toLowerCase(), name };
}

/** What the browser carries between /auth/google and the callback. */
export interface GoogleState {
  state: string;
  nonce: string;
  verifier: string;
  /** The account type for a new account (an existing one keeps its role). */
  role: 'student' | 'mentor';
  expiresAt: number;
}

export function newGoogleState(role: GoogleState['role'], nowMs: number): GoogleState {
  const r = () => randomBytes(24).toString('base64url');
  return {
    state: r(),
    nonce: r(),
    verifier: randomBytes(32).toString('base64url'),
    role,
    expiresAt: nowMs + GOOGLE_STATE_SECONDS * 1000,
  };
}

export const codeChallenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(`google-state:${payload}`).digest('base64url');

export function sealState(secret: string, s: GoogleState): string {
  const payload = Buffer.from(JSON.stringify(s)).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
}

/** The state from the cookie, when its signature holds and it has not expired. */
export function openState(
  secret: string,
  raw: string | undefined,
  nowMs: number,
): GoogleState | null {
  if (!raw) return null;
  const [payload = '', sig = ''] = raw.split('.');
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as GoogleState;
    return s.expiresAt > nowMs ? s : null;
  } catch {
    return null;
  }
}
