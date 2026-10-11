'use client';

import { Banner, SuccessRing } from '@sabeq/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthCard, PasswordField, messageOf } from '@/components/auth/AuthParts';
import { useAuth, resetPassword, type AuthUser } from '@/lib/auth';

const MIN_PASSWORD = 8;

/**
 * Picks a new password from an emailed link. It works once; every device is signed out after, so
 * the person signs in again with the new password.
 */
export function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const { refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<AuthUser['role'] | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (password.length < MIN_PASSWORD)
      next.password = `الباسورد لازم ${MIN_PASSWORD} حروف أو أرقام على الأقل.`;
    else if (confirm !== password) next.confirm = 'الباسورد مش زي اللي فوقه.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const { role } = await resetPassword(token, password);
      await refresh();
      setDone(role);
    } catch (err) {
      setErrors({ form: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="الباسورد اتغيّر" footer={null}>
        <div className="done-ok">
          <SuccessRing />
          {done === 'admin' ? (
            <p className="sb-small">ادخل لوحة الإدارة بالإيميل والباسورد الجديد.</p>
          ) : (
            <>
              <p className="sb-small">خرّجنا كل الأجهزة. ادخل تاني بالباسورد الجديد.</p>
              <Link className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block" href="/login">
                سجّل دخولك
              </Link>
            </>
          )}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="اختار باسورد جديد" footer={null}>
      <form className="auth-body" onSubmit={(e) => void submit(e)} noValidate>
        {!token ? (
          <Banner kind="error" title="الرابط ناقص">
            افتح الرابط من الإيميل زي ما هو، أو{' '}
            <Link className="ul" href="/forgot-password">
              اطلب رابط جديد
            </Link>
            .
          </Banner>
        ) : null}
        {errors.form ? (
          <Banner kind="error" title="ما اتغيّرش">
            {errors.form}{' '}
            <Link className="ul" href="/forgot-password">
              اطلب رابط جديد
            </Link>
          </Banner>
        ) : null}
        <PasswordField
          id="pw"
          label="الباسورد الجديد"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setErrors({});
          }}
          error={errors.password ?? null}
          hint={`${MIN_PASSWORD} حروف أو أرقام على الأقل.`}
          autoComplete="new-password"
        />
        <PasswordField
          id="pw2"
          label="اكتبه تاني"
          value={confirm}
          onChange={(v) => {
            setConfirm(v);
            setErrors({});
          }}
          error={errors.confirm ?? null}
          autoComplete="new-password"
        />
        <button
          type="submit"
          className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
          aria-busy={busy}
          disabled={!token}
        >
          احفظ الباسورد
        </button>
      </form>
    </AuthCard>
  );
}
