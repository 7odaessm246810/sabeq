import { describe, expect, it } from 'vitest';
import { formatEGP, piasters, poundsToPiasters, splitCommission } from './money.js';

describe('money', () => {
  it('converts pounds to integer piasters', () => {
    expect(poundsToPiasters(250)).toBe(25_000);
    expect(poundsToPiasters(19.99)).toBe(1_999);
  });

  it('rejects floats, negatives and sub-piaster precision', () => {
    expect(() => piasters(1.5)).toThrow(RangeError);
    expect(() => piasters(-1)).toThrow(RangeError);
    expect(() => poundsToPiasters(1.005)).toThrow(RangeError);
  });

  it('formats like the design', () => {
    expect(formatEGP(piasters(25_000))).toBe('250 ج.م');
    expect(formatEGP(piasters(124_050))).toBe('1,240.50 ج.م');
  });

  it('takes a 10% platform commission by default', () => {
    expect(splitCommission(piasters(25_000))).toEqual({
      total: 25_000,
      platformFee: 2_500,
      mentorEarning: 22_500,
    });
  });

  it('always sums back to the total', () => {
    for (const total of [1, 7, 333, 26_550, 99_999]) {
      const s = splitCommission(piasters(total));
      expect(s.platformFee + s.mentorEarning).toBe(total);
    }
  });
});
