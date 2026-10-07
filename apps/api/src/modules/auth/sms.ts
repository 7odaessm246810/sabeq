/**
 * SMS delivery behind one interface, so the provider can change without touching the OTP logic.
 * Real providers (local aggregator + Twilio Verify fallback) plug in here before production;
 * config validation refuses `console` in production.
 */
import { formatEgyptianMobile } from '@sabeq/utils';
import type { Logger } from 'pino';

export interface SmsSender {
  /** Whether codes are visible to developers (logged / returned to the page in local). */
  readonly insecure: boolean;
  sendOtp(phone: string, code: string): Promise<void>;
}

/** Local and staging: the code is written to the API log instead of being sent. */
export function consoleSms(logger: Logger): SmsSender {
  return {
    insecure: true,
    sendOtp(phone, code) {
      // `devCode`, not `otpCode`: the logger redacts OTP fields everywhere else on purpose.
      logger.warn(
        { to: formatEgyptianMobile(phone), devCode: code },
        'OTP (console SMS — not sent)',
      );
      return Promise.resolve();
    },
  };
}
