'use client';

import { Banner, FieldError, cx } from '@sabeq/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { AuthCard, messageOf, useProviders } from '@/components/auth/AuthParts';
import { forgotPassword } from '@/lib/auth';

/** Asks for a password link. Same answer whether or not the email has an account. */
export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const providers = useProviders();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim()) {
      setError('اكتب الإيميل.');
      return;
    }
    setBusy(true);
    try {
      setSent(await forgotPassword(email.trim()));
    } catch (err) {
      setError(messageOf(err, 'email'));
    } finally {
      setBusy(false);
    }
  }

  if (providers && !providers.emailLinks) {
    return (
      <AuthCard title="نسيت الباسورد؟" footer={null}>
        <p className="sb-small" style={{ textAlign: 'center' }}>
          تغيير الباسورد بالإيميل مش متاح دلوقتي. كلّمنا من صفحة التواصل وهنساعدك ترجع لحسابك.
        </p>
        <Link className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block" href="/contact">
          كلّمنا
        </Link>
        <Link className="sb-btn sb-btn--secondary sb-btn--lg sb-btn--block" href="/login">
          رجوع لتسجيل الدخول
        </Link>
      </AuthCard>
    );
  }

  if (sent) {
    return (
      <AuthCard title="شوف إيميلك" footer={null}>
        <p className="sb-small" style={{ textAlign: 'center' }}>
          لو <span dir="ltr">{email.trim()}</span> عليه حساب في سابق، بعتنالك عليه رابط تختار منه
          باسورد جديد. الرابط شغال ساعة. لو مش لاقيه، بص في الـ Spam.
        </p>
        {sent.devLink ? (
          <Banner kind="info" title="للتجربة على جهازك">
            <a className="ul" href={sent.devLink}>
              افتح رابط الباسورد
            </a>
          </Banner>
        ) : null}
        <Link className="sb-btn sb-btn--secondary sb-btn--lg sb-btn--block" href="/login">
          رجوع لتسجيل الدخول
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="نسيت الباسورد؟"
      lead="اكتب إيميلك وهنبعتلك رابط تختار منه باسورد جديد."
      footer={null}
    >
      <form className="auth-body" onSubmit={(e) => void submit(e)} noValidate>
        <div className={cx('sb-field', error && 'sb-field--error')}>
          <label className="sb-label" htmlFor="em">
            الإيميل
          </label>
          <input
            className="sb-input"
            id="em"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'em-err' : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
          {error ? <FieldError id="em-err">{error}</FieldError> : null}
        </div>
        <button
          type="submit"
          className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
          aria-busy={busy}
        >
          ابعتلي الرابط
        </button>
        <p className="sb-small" style={{ textAlign: 'center' }}>
          افتكرته؟{' '}
          <Link href="/login" className="ul">
            سجّل دخولك
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
