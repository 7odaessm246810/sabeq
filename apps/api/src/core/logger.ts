/**
 * Structured JSON logs (pino). Secrets and personal data are redacted before anything is written:
 * the platform handles phone numbers, national-ID documents and payments (Phase 21).
 */
import { pino, type Logger } from 'pino';
import type { Config } from '../config/env.js';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.otp',
  '*.otpCode',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.phone',
  '*.nationalId',
  '*.cardNumber',
];

export function createLogger(config: Pick<Config, 'logLevel' | 'nodeEnv' | 'appEnv'>): Logger {
  return pino({
    level: config.logLevel,
    base: { service: 'sabeq-api', env: config.appEnv },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    // Readable output for people in development; JSON everywhere else (log shippers parse it).
    ...(config.nodeEnv === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : {}),
  });
}
