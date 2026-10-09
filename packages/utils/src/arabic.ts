/**
 * Arabic text matching for search. Students type the same word many ways — «هندسة» / «هندسه»,
 * «أسيوط» / «اسيوط», with or without diacritics — so both the query and the indexed text are folded
 * to one spelling before comparing.
 */

const DIACRITICS = /[\u064B-\u065F\u0670\u0640]/g; // harakat, superscript alef, tatweel

/** Folds letter variants, drops diacritics and punctuation, lowercases Latin, single spaces. */
export function normalizeArabic(text: string): string {
  return text
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Words that say nothing about which faculty is meant: «كلية هندسة جامعة القاهرة». */
const STOP_WORDS = new Set([
  'كليه',
  'جامعه',
  'في',
  'من',
  'ب',
  'و',
  'قسم',
  'faculty',
  'university',
  'of',
]);

/**
 * Query words to look for, normalised. A leading «ال» is dropped (when enough remains), so «الهندسة»
 * also finds «هندسة الحاسبات» and «هندسة» finds «كلية الهندسة» — matching is by substring.
 */
export function searchTokens(query: string): string[] {
  const words = normalizeArabic(query)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .map((w) => (w.startsWith('ال') && w.length > 4 ? w.slice(2) : w));
  return [...new Set(words)].slice(0, 8);
}
