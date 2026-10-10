/**
 * Email (Phase 19) behind one interface: `resend` sends through Resend's HTTP API; `console` (local
 * and tests — refused in production) logs and keeps the message, so the website shows nothing but
 * development can still follow every email.
 */
import type { Logger } from 'pino';
import type { Config } from '../../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSender {
  readonly name: 'resend' | 'console';
  send(message: EmailMessage): Promise<{ id: string }>;
}

export class EmailError extends Error {
  override name = 'EmailError';
}

export function createResendSender(cfg: Config['email']): EmailSender {
  if (!cfg.apiKey) throw new Error('EMAIL_API_KEY is missing');
  return {
    name: 'resend',
    async send({ to, subject, text, html }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cfg.from, to: [to], subject, text, html }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.text();
      if (!res.ok) throw new EmailError(`Resend → ${res.status}: ${body.slice(0, 300)}`);
      return { id: String((JSON.parse(body) as { id?: string }).id ?? '') };
    },
  };
}

/** Logs instead of sending; `sent` keeps every message (tests read it). */
export function createConsoleSender(logger: Logger): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'console',
    sent,
    send(message) {
      sent.push(message);
      if (sent.length > 200) sent.shift();
      logger.info(
        { to: message.to, subject: message.subject },
        `email (not sent): ${message.text}`,
      );
      return Promise.resolve({ id: `console-${Date.now()}` });
    },
  };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** One plain, right-to-left layout for every Sabeq email. */
export function renderEmail(input: {
  title: string;
  body: string;
  action?: { label: string; url: string };
  footer: string;
}): { text: string; html: string } {
  const text = [
    input.title,
    '',
    input.body,
    ...(input.action ? ['', `${input.action.label}: ${input.action.url}`] : []),
    '',
    '—',
    input.footer,
  ].join('\n');
  const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f5f3ee;font-family:Tahoma,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #e3ded3;border-radius:14px" cellpadding="0" cellspacing="0"><tr><td dir="rtl" style="padding:28px;text-align:right;color:#1b2a25">
<div style="font-size:20px;font-weight:bold;color:#0f6b55;margin-bottom:18px">سابق</div>
<h1 style="font-size:20px;margin:0 0 10px">${escape(input.title)}</h1>
<p style="font-size:15px;line-height:1.8;margin:0 0 18px">${escape(input.body)}</p>
${
  input.action
    ? `<a href="${escape(input.action.url)}" style="display:inline-block;background:#0f6b55;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px">${escape(input.action.label)}</a>`
    : ''
}
<p style="font-size:12px;color:#6b7a75;line-height:1.7;margin:24px 0 0">${escape(input.footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
