'use client';

import { FieldError, Logo, cx } from '@sabeq/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const messageOf = (err: unknown, field: string) =>
  err instanceof ApiError ? (err.fields[field] ?? err.message) : 'حصلت مشكلة. جرّب تاني.';

/**
 * Admin login: phone → OTP, against /api/v1/admin/auth. Only numbers created with
 * `pnpm admin:create` receive a code; every other number gets the same answer and no SMS.
 */
export function LoginForm() {
  const { status, requestCode, verifyCode } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'signed-in') router.replace('/');
  }, [status, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (step === 'phone') {
        const sent = await requestCode(phone);
        setDevCode(sent.devCode ?? null);
        setStep('code');
      } else {
        await verifyCode(phone, code);
        router.replace('/');
      }
    } catch (err) {
      setError(messageOf(err, step === 'phone' ? 'phone' : 'code'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="adm-auth">
      <form className="sb-card adm-auth-card" onSubmit={(e) => void submit(e)} noValidate>
        <div className="adm-brand">
          <Logo size={28} />
          <span className="sb-badge sb-badge--neutral">لوحة التحكم</span>
        </div>
        <h1 className="sb-h3">دخول الإدارة</h1>
        {step === 'phone' ? (
          <div className={cx('sb-field', error && 'sb-field--error')}>
            <label className="sb-label" htmlFor="ph">
              رقم الموبايل
            </label>
            <input
              id="ph"
              className="sb-input"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder="01x xxxx xxxx"
              value={phone}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'ph-err' : undefined}
              onChange={(e) => setPhone(e.target.value)}
            />
            {error ? <FieldError id="ph-err">{error}</FieldError> : null}
          </div>
        ) : (
          <div className={cx('sb-field', error && 'sb-field--error')}>
            <label className="sb-label" htmlFor="code">
              الكود اللي وصلك على {phone}
            </label>
            <input
              id="code"
              className="sb-input"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'code-err' : undefined}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            {error ? <FieldError id="code-err">{error}</FieldError> : null}
            {devCode ? (
              <span className="sb-hint">
                للتجربة على جهازك: الكود <span className="sb-num">{devCode}</span>
              </span>
            ) : null}
          </div>
        )}
        <button
          type="submit"
          className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
          aria-busy={busy}
        >
          {step === 'phone' ? 'ابعتلي الكود' : 'دخول'}
        </button>
        {step === 'code' ? (
          <button
            type="button"
            className="sb-btn sb-btn--link"
            onClick={() => {
              setStep('phone');
              setCode('');
              setError(null);
            }}
          >
            غيّر الرقم
          </button>
        ) : null}
        <p className="sb-caption">الدخول للحسابات المسجّلة كأدمن بس.</p>
      </form>
    </main>
  );
}
