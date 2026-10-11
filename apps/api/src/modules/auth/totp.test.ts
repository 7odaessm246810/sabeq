import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, currentStep, matchTotp, otpauthUri, totpAt } from './totp.js';

// RFC 6238 appendix B, SHA-1 key "12345678901234567890" (last 6 of the 8-digit values).
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('round-trips base32', () => {
    expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(RFC_SECRET).toString()).toBe('12345678901234567890');
    expect(() => base32Decode('not base32!')).toThrow();
  });

  it('matches the RFC 6238 test vectors', () => {
    expect(totpAt(RFC_SECRET, currentStep(59_000))).toBe('287082');
    expect(totpAt(RFC_SECRET, currentStep(1_111_111_109_000))).toBe('081804');
    expect(totpAt(RFC_SECRET, currentStep(2_000_000_000_000))).toBe('279037');
  });

  it('accepts one step of drift and never a step at or before the last one used', () => {
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step), now, null)).toBe(step);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now, null)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now, null)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 2), now, null)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpAt(RFC_SECRET, step), now, step)).toBeNull();
    expect(matchTotp(RFC_SECRET, '12345', now, null)).toBeNull();
  });

  it('builds the authenticator link', () => {
    expect(otpauthUri('ABC', 'a@b.c')).toBe(
      'otpauth://totp/Sabeq%3Aa%40b.c?secret=ABC&issuer=Sabeq&algorithm=SHA1&digits=6&period=30',
    );
  });
});
