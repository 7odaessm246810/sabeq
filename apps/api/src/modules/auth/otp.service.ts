/**
 * One-time codes for phone login (ADR-0005).
 *
 * - 6 digits from a CSPRNG, valid 5 minutes, single use, 5 wrong guesses and it is burned.
 * - Stored in Redis as an HMAC (keyed by AUTH_OTP_SECRET), never in plain text.
 * - Sending is throttled per phone (cooldown + daily cap) and per IP, because every send is a paid
 *   SMS and an attacker could otherwise flood a stranger's phone.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Redis } from 'ioredis';
import { Errors } from '../../core/errors.js';
import { hitWindow } from './limits.js';
import type { SmsSender } from './sms.js';

export const OTP_POLICY = {
  length: 6,
  ttlSeconds: 300,
  maxAttempts: 5,
  resendCooldownSeconds: 30,
  perPhonePerDay: 10,
  perIpPerHour: 30,
  verifyPerIpPerHour: 60,
} as const;

export interface OtpRequestResult {
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** Local development only: the code itself, so the login page can show it. */
  devCode?: string;
}

export interface OtpService {
  /** `deliver: false` runs every check but sends nothing (unknown admin phones — no enumeration). */
  request(phone: string, ip: string, opts?: { deliver?: boolean }): Promise<OtpRequestResult>;
  /** Throws VALIDATION_FAILED (`fields.code`) on a wrong / expired code; consumes it on success. */
  verify(phone: string, code: string, ip: string): Promise<void>;
}

interface Deps {
  redis: Redis;
  sms: SmsSender;
  secret: string;
  /** Return the code to the client — only ever true in APP_ENV=local with the console sender. */
  exposeCode: boolean;
}

const key = {
  code: (phone: string) => `otp:code:${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
  day: (phone: string) => `otp:day:${phone}`,
  ip: (ip: string) => `otp:ip:${ip}`,
  verifyIp: (ip: string) => `otp:verify-ip:${ip}`,
};

const MESSAGES = {
  cooldown: 'استنى شوية قبل ما تطلب كود جديد.',
  daily: 'طلبت أكواد كتير النهارده. جرّب تاني بكرة.',
  ip: 'طلبات كتير من الجهاز ده. استنى شوية وجرّب تاني.',
  expired: 'الكود انتهى أو مش موجود. اطلب كود جديد.',
  burned: 'جرّبت كتير. اطلب كود جديد.',
  wrong: (left: number) =>
    left === 1 ? 'الكود غلط. فاضل محاولة واحدة.' : `الكود غلط. فاضل ${left} محاولات.`,
};

export function createOtpService({ redis, sms, secret, exposeCode }: Deps): OtpService {
  const digest = (phone: string, code: string) =>
    createHmac('sha256', secret).update(`${phone}:${code}`).digest();

  return {
    async request(phone, ip, { deliver = true } = {}) {
      const perIp = await hitWindow(redis, key.ip(ip), OTP_POLICY.perIpPerHour, 3600);
      if (!perIp.allowed) throw Errors.rateLimited(MESSAGES.ip, perIp.retryAfter);

      // SET NX: only one send per cooldown window, even with concurrent requests.
      const fresh = await redis.set(
        key.cooldown(phone),
        '1',
        'EX',
        OTP_POLICY.resendCooldownSeconds,
        'NX',
      );
      if (fresh !== 'OK') {
        const ttl = await redis.ttl(key.cooldown(phone));
        throw Errors.rateLimited(
          MESSAGES.cooldown,
          ttl > 0 ? ttl : OTP_POLICY.resendCooldownSeconds,
        );
      }

      const daily = await hitWindow(redis, key.day(phone), OTP_POLICY.perPhonePerDay, 86_400);
      if (!daily.allowed) throw Errors.rateLimited(MESSAGES.daily, daily.retryAfter);

      const code = randomInt(0, 10 ** OTP_POLICY.length)
        .toString()
        .padStart(OTP_POLICY.length, '0');
      if (deliver) {
        // A new code replaces the previous one and resets the attempt counter.
        await redis
          .multi()
          .del(key.code(phone))
          .hset(key.code(phone), { h: digest(phone, code).toString('hex'), a: 0 })
          .expire(key.code(phone), OTP_POLICY.ttlSeconds)
          .exec();
        await sms.sendOtp(phone, code);
      }

      return {
        expiresInSeconds: OTP_POLICY.ttlSeconds,
        resendAfterSeconds: OTP_POLICY.resendCooldownSeconds,
        ...(exposeCode && deliver ? { devCode: code } : {}),
      };
    },

    async verify(phone, code, ip) {
      const perIp = await hitWindow(redis, key.verifyIp(ip), OTP_POLICY.verifyPerIpPerHour, 3600);
      if (!perIp.allowed) throw Errors.rateLimited(MESSAGES.ip, perIp.retryAfter);

      const k = key.code(phone);
      const stored = await redis.hget(k, 'h');
      if (!stored) throw Errors.validation({ code: MESSAGES.expired });

      // Count the attempt before comparing, so parallel guesses cannot exceed the limit.
      const attempts = await redis.hincrby(k, 'a', 1);
      if (attempts > OTP_POLICY.maxAttempts) {
        await redis.del(k);
        throw Errors.validation({ code: MESSAGES.burned });
      }

      const expected = Buffer.from(stored, 'hex');
      const actual = digest(phone, code);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
        const left = OTP_POLICY.maxAttempts - attempts;
        if (left <= 0) {
          await redis.del(k);
          throw Errors.validation({ code: MESSAGES.burned });
        }
        throw Errors.validation({ code: MESSAGES.wrong(left) });
      }

      // Single use: of two concurrent correct submissions only the one that deletes the key wins.
      if ((await redis.del(k)) !== 1) throw Errors.validation({ code: MESSAGES.expired });
    },
  };
}
