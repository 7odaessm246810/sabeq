'use client';

import { FieldError, Logo, cx } from '@sabeq/ui';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { useAuth, type LoginStep } from '@/lib/auth';

const WEB = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

const messageOf = (err: unknown, field: string) =>
  err instanceof ApiError ? (err.fields[field] ?? err.message) : 'حصلت مشكلة. جرّب تاني.';

/**
 * Admin login (ADR-0017): email + password, then the 6-digit code from an authenticator app
 * (Google Authenticator, Microsoft Authenticator, 1Password…). The first time, the app is set up
 * here from a QR code. Accounts come only from `pnpm admin:create`.
 */
export function LoginForm() {
  const { status, login, verifyCode } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<LoginStep | null>(null);
  const [code, setCode] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'signed-in') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    if (step?.step !== 'setup') return;
    let live = true;
    QRCode.toDataURL(step.uri, { margin: 1, width: 200 })
      .then((url) => live && setQr(url))
      .catch(() => live && setQr(null));
    return () => {
      live = false;
    };
  }, [step]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (!step) {
        setStep(await login(email.trim(), password));
        setPassword('');
      } else {
        await verifyCode(step.challenge, code);
        router.replace('/');
      }
    } catch (err) {
      // An expired or burned step starts over from the password.
      if (step && err instanceof ApiError && err.status === 401) {
        setStep(null);
        setCode('');
      }
      setError(messageOf(err, step ? 'code' : 'email'));
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
        {!step ? (
          <>
            <div className={cx('sb-field', error && 'sb-field--error')}>
              <label className="sb-label" htmlFor="em">
                الإيميل
              </label>
              <input
                id="em"
                className="sb-input"
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="username"
                value={email}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-err' : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className={cx('sb-field', error && 'sb-field--error')}>
              <label className="sb-label" htmlFor="pw">
                الباسورد
              </label>
              <input
                id="pw"
                className="sb-input"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-err' : undefined}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error ? <FieldError id="login-err">{error}</FieldError> : null}
            </div>
          </>
        ) : (
          <>
            {step.step === 'setup' ? (
              <div className="adm-totp-setup">
                <p className="sb-small">
                  أول مرة: افتح تطبيق المصادقة على موبايلك (Google Authenticator أو Microsoft
                  Authenticator) واعمل مسح للكود ده، وبعدين اكتب الـ 6 أرقام اللي هتظهر.
                </p>
                {qr ? (
                  // A data: URL made on this page — next/image adds nothing here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} width={200} height={200} alt="كود QR لتطبيق المصادقة" />
                ) : null}
                <p className="sb-caption">
                  مش عارف تعمل مسح؟ اكتب المفتاح ده في التطبيق:{' '}
                  <code className="adm-ltr" dir="ltr">
                    {step.secret.replace(/(.{4})/g, '$1 ').trim()}
                  </code>
                </p>
              </div>
            ) : null}
            <div className={cx('sb-field', error && 'sb-field--error')}>
              <label className="sb-label" htmlFor="code">
                الكود اللي ظاهر في تطبيق المصادقة
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
            </div>
          </>
        )}
        <button
          type="submit"
          className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
          aria-busy={busy}
          disabled={step ? code.length !== 6 : !email.trim() || !password}
        >
          {!step ? 'التالي' : 'دخول'}
        </button>
        {step ? (
          <button
            type="button"
            className="sb-btn sb-btn--link"
            onClick={() => {
              setStep(null);
              setCode('');
              setError(null);
            }}
          >
            رجوع
          </button>
        ) : null}
        <p className="sb-caption">
          الدخول للحسابات المسجّلة كأدمن بس.{' '}
          <a className="ul" href={`${WEB}/forgot-password`}>
            نسيت الباسورد؟
          </a>{' '}
          غيّرت الموبايل؟ كلّم مدير المنصة يعيد ضبط حسابك.
        </p>
      </form>
    </main>
  );
}
