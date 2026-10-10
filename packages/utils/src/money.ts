import { PLATFORM } from '@sabeq/types';

/**
 * Money is always an integer number of piasters (1 EGP = 100 piasters) — never a float (ADR-0010).
 * `Piasters` is a branded number so a plain pound value cannot be passed by mistake.
 */
export type Piasters = number & { readonly __brand: 'Piasters' };

export function piasters(value: number): Piasters {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`Invalid piasters amount: ${value}`);
  }
  return value as Piasters;
}

/** 250 → 25000 piasters. Accepts at most two decimal places. */
export function poundsToPiasters(pounds: number): Piasters {
  const value = Math.round(pounds * 100);
  if (Math.abs(value - pounds * 100) > 1e-6) {
    throw new RangeError(`More than two decimals: ${pounds}`);
  }
  return piasters(value);
}

/** Display format used across the design: Latin digits + «ج.م» → "250 ج.م", "1,240.50 ج.م". */
export function formatEGP(amount: Piasters): string {
  const pounds = amount / 100;
  const text = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(pounds);
  return `${text} ج.م`;
}

export interface CommissionSplit {
  total: Piasters;
  platformFee: Piasters;
  mentorEarning: Piasters;
}

/**
 * Splits a session price between the platform and the mentor.
 * The platform fee is rounded half-up; the mentor gets the exact remainder, so the parts always sum to total.
 */
export function splitCommission(
  total: Piasters,
  commissionBps: number = PLATFORM.commissionBps,
): CommissionSplit {
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 10_000) {
    throw new RangeError(`Invalid commission bps: ${commissionBps}`);
  }
  const platformFee = piasters(Math.floor((total * commissionBps + 5_000) / 10_000));
  return { total, platformFee, mentorEarning: piasters(total - platformFee) };
}

/** Price of a session type from the mentor's base price, rounded to 10 EGP (docs/database.md). */
export function sessionPricePiasters(basePiasters: number, multiplier: number): Piasters {
  return piasters(Math.round((basePiasters * multiplier) / 1000) * 1000);
}
