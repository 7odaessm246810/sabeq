import { describe, expect, it } from 'vitest';
import { normalizeArabic, searchTokens } from './arabic.js';

describe('normalizeArabic', () => {
  it('folds the spellings students actually type', () => {
    expect(normalizeArabic('كلية الهندسة')).toBe(normalizeArabic('كليه الهندسه'));
    expect(normalizeArabic('جامعة أسيوط')).toBe('جامعه اسيوط');
    expect(normalizeArabic('إعلام')).toBe('اعلام');
    expect(normalizeArabic('مستشفى')).toBe('مستشفي');
    expect(normalizeArabic('العَرُوض')).toBe('العروض');
    expect(normalizeArabic('Cairo  University!')).toBe('cairo university');
    expect(normalizeArabic('٦ أكتوبر')).toBe('6 اكتوبر');
  });
});

describe('searchTokens', () => {
  it('keeps the words that identify a faculty', () => {
    expect(searchTokens('كلية هندسة جامعة القاهرة')).toEqual(['هندسه', 'قاهره']);
    expect(searchTokens('طب أسيوط')).toEqual(['طب', 'اسيوط']);
    expect(searchTokens('  ')).toEqual([]);
  });

  it('does not strip «ال» from short words', () => {
    expect(searchTokens('الطب')).toEqual(['الطب']);
  });
});
