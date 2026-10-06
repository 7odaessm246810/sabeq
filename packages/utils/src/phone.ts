/**
 * Egyptian mobile numbers. Login is phone + OTP (ADR-0005), so every number is stored
 * in one canonical E.164 form: +201XXXXXXXXX (operators 010, 011, 012, 015).
 */
const EG_MOBILE = /^1[0125]\d{8}$/;

const ARABIC_INDIC_DIGITS = /[٠-٩]/g;

/** Returns `+201XXXXXXXXX`, or `null` when the input is not a valid Egyptian mobile number. */
export function normalizeEgyptianMobile(input: string): string | null {
  const ascii = input.replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
  let digits = ascii.replace(/[\s\-()]/g, '');

  if (digits.startsWith('+20')) digits = digits.slice(3);
  else if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  return EG_MOBILE.test(digits) ? `+20${digits}` : null;
}

/** "+201012345678" → "010 1234 5678" for display. */
export function formatEgyptianMobile(e164: string): string {
  const local = `0${e164.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 7)} ${local.slice(7)}`;
}
