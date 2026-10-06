import { describe, expect, it } from 'vitest';
import { formatEgyptianMobile, normalizeEgyptianMobile } from './phone.js';

describe('normalizeEgyptianMobile', () => {
  it.each([
    '01012345678',
    '+201012345678',
    '00201012345678',
    '201012345678',
    '010 1234 5678',
    '٠١٠١٢٣٤٥٦٧٨',
  ])('accepts %s', (input) => {
    expect(normalizeEgyptianMobile(input)).toBe('+201012345678');
  });

  it.each(['0101234567', '01312345678', '0221234567', 'abc', ''])('rejects %s', (input) => {
    expect(normalizeEgyptianMobile(input)).toBeNull();
  });

  it('formats for display', () => {
    expect(formatEgyptianMobile('+201512345678')).toBe('015 1234 5678');
  });
});
