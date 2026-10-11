import { describe, expect, it } from 'vitest';
import { checkIdToken, codeChallenge, newGoogleState, openState, sealState } from './google.js';

const NOW = 1_700_000_000_000;
const good = {
  iss: 'https://accounts.google.com',
  aud: 'client-id',
  exp: NOW / 1000 + 60,
  nonce: 'n1',
  sub: '1234',
  email: 'Someone@Gmail.com',
  email_verified: true,
  name: '  Salma  ',
};
const expect_ = { clientId: 'client-id', nonce: 'n1', nowMs: NOW };

describe('google id token', () => {
  it('accepts a good token and lowercases the email', () => {
    expect(checkIdToken(good, expect_)).toEqual({
      sub: '1234',
      email: 'someone@gmail.com',
      name: 'Salma',
    });
  });

  it.each([
    ['issuer', { iss: 'https://evil.example' }],
    ['audience', { aud: 'other-client' }],
    ['expired', { exp: NOW / 1000 - 1 }],
    ['nonce', { nonce: 'other' }],
    ['email not verified', { email_verified: false }],
  ])('refuses a bad %s', (why, over) => {
    expect(() => checkIdToken({ ...good, ...over }, expect_)).toThrow(why);
  });
});

describe('google state cookie', () => {
  it('opens only what it sealed, before it expires', () => {
    const s = newGoogleState('mentor', NOW);
    const sealed = sealState('secret-a', s);
    expect(openState('secret-a', sealed, NOW)).toEqual(s);
    expect(openState('secret-b', sealed, NOW)).toBeNull();
    expect(openState('secret-a', `${sealed}x`, NOW)).toBeNull();
    expect(openState('secret-a', sealed, s.expiresAt)).toBeNull();
    expect(openState('secret-a', undefined, NOW)).toBeNull();
  });

  it('derives the S256 PKCE challenge', () => {
    // RFC 7636 appendix B.
    expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});
