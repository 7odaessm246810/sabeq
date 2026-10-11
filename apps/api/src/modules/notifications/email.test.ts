import { pino } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailError, createConsoleSender, createResendSender, renderEmail } from './email.js';

afterEach(() => vi.unstubAllGlobals());

const message = { to: 'sama@example.com', subject: 'جلستك بعد شوية', text: 't', html: '<p>h</p>' };

describe('Resend sender', () => {
  it('sends from EMAIL_FROM with the API key, and returns the message id', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: 'msg_1' })));
    vi.stubGlobal('fetch', fetch);
    const resend = createResendSender({
      provider: 'resend',
      from: 'سابق <no-reply@sabeq.test>',
      apiKey: 're_test',
    });
    expect(await resend.send(message)).toEqual({ id: 'msg_1' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'سابق <no-reply@sabeq.test>',
      to: ['sama@example.com'],
      subject: message.subject,
      text: 't',
      html: '<p>h</p>',
    });
  });

  it('a refusal from Resend is an EmailError (the sweeper retries); no key, no sender', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('{"message":"bad"}', { status: 422 })),
    );
    const resend = createResendSender({ provider: 'resend', from: 'x <a@b.c>', apiKey: 'k' });
    await expect(resend.send(message)).rejects.toBeInstanceOf(EmailError);
    expect(() =>
      createResendSender({ provider: 'resend', from: 'x', apiKey: undefined }),
    ).toThrow();
  });
});

describe('console sender', () => {
  it('keeps what it would have sent (the newest 200)', async () => {
    const sender = createConsoleSender(pino({ level: 'silent' }));
    for (let i = 0; i < 205; i++) await sender.send({ ...message, subject: `#${i}` });
    expect(sender.sent).toHaveLength(200);
    expect(sender.sent[0]?.subject).toBe('#5');
  });
});

describe('renderEmail', () => {
  it('is right-to-left, with the action as a link and as text', () => {
    const { text, html } = renderEmail({
      title: 'جلسة اتلغت',
      body: 'هترجعلك فلوسك كاملة.',
      action: { label: 'افتح سابق', url: 'https://sabeq.test/sessions' },
      footer: 'تقدر توقف الإيميلات من «حسابي».',
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('href="https://sabeq.test/sessions"');
    expect(text).toContain('افتح سابق: https://sabeq.test/sessions');
  });

  it('escapes whatever people wrote, so nothing becomes markup', () => {
    const { html } = renderEmail({
      title: '<img src=x onerror=alert(1)>',
      body: 'A "quote" & <b>bold</b>',
      action: { label: 'x', url: 'https://sabeq.test/?a=1&b="2"' },
      footer: "it's",
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>bold');
    expect(html).toContain('&#60;img');
    expect(html).toContain('&#38;b=&#34;2&#34;');
  });
});
