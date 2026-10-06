/** Business constants that must be identical on every side of the platform. */
export const PLATFORM = {
  currency: 'EGP',
  timezone: 'Africa/Cairo',
  locale: 'ar-EG',
  /** Platform commission in basis points: 1000 = 10% (ADR-0009). */
  commissionBps: 1000,
  apiVersion: 'v1',
} as const;
