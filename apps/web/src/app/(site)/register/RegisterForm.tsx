'use client';

import { Banner, FieldError, Segmented, cx, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import {
  AuthCard,
  GoogleButton,
  PasswordField,
  messageOf,
  useAfterLogin,
  useProviders,
} from '@/components/auth/AuthParts';
import { ApiError } from '@/lib/api';
import { useAuth, type SignupRole } from '@/lib/auth';
import { useDemo } from '@/lib/demo-store';

type Field = 'fullName' | 'email' | 'password';
const MIN_PASSWORD = 8;

/**
 * A new account (ADR-0017): account type, name, email and password — or Google. The email gets a
 * confirmation link; booking waits for it, browsing does not.
 */
export function RegisterForm() {
  const auth = useAuth();
  const toast = useToast();
  const demo = useDemo();
  const afterLogin = useAfterLogin();
  const providers = useProviders();
  // Coming from "become a mentor" pre-selects the mentor account type.
  const [role, setRole] = useState<SignupRole>(() =>
    demo.after?.startsWith('/become-mentor') ? 'mentor' : 'student',
  );
  const [f, setF] = useState<Record<Field, string>>({ fullName: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string | undefined>>>({});
  const [busy, setBusy] = useState(false);

  const set = (k: Field, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: undefined, form: undefined }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (f.fullName.trim().length < 2) next.fullName = 'اكتب اسمك.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) next.email = 'الإيميل ده مش مكتوب صح.';
    if (f.password.length < MIN_PASSWORD)
      next.password = `الباسورد لازم ${MIN_PASSWORD} حروف أو أرقام على الأقل.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const { user } = await auth.register({
        fullName: f.fullName.trim(),
        email: f.email.trim(),
        password: f.password,
        role,
      });
      toast({
        kind: 'success',
        title: 'اتعمل حسابك',
        ...(providers?.emailLinks
          ? {
              description: `بعتنالك رابط تأكيد على ${user.email ?? 'إيميلك'}. أكّده عشان تقدر تحجز.`,
            }
          : {}),
      });
      await afterLogin(user, true);
    } catch (err) {
      const fields = err instanceof ApiError ? err.fields : {};
      setErrors(
        Object.keys(fields).length
          ? { fullName: fields.fullName, email: fields.email, password: fields.password }
          : { form: messageOf(err) },
      );
      setBusy(false);
    }
  }

  return (
    <AuthCard title="اعمل حساب على سابق" lead="دقيقة واحدة وتبدأ.">
      <Segmented
        block
        label="نوع الحساب"
        value={role}
        onChange={setRole}
        options={[
          ['student', 'أنا طالب'],
          ['mentor', 'أنا مستشار'],
        ]}
      />
      {providers?.google ? <GoogleButton role={role} label="كمّل بحساب جوجل" /> : null}
      <form className="auth-body" onSubmit={(e) => void submit(e)} noValidate>
        {errors.form ? (
          <Banner kind="error" title="ما اتعملش الحساب">
            {errors.form}
          </Banner>
        ) : null}
        <div className={cx('sb-field', errors.fullName && 'sb-field--error')}>
          <label className="sb-label" htmlFor="nm">
            اسمك
          </label>
          <input
            className="sb-input"
            id="nm"
            autoComplete="name"
            maxLength={60}
            value={f.fullName}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'nm-err' : undefined}
            onChange={(e) => set('fullName', e.target.value)}
          />
          {errors.fullName ? <FieldError id="nm-err">{errors.fullName}</FieldError> : null}
        </div>
        <div className={cx('sb-field', errors.email && 'sb-field--error')}>
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
            value={f.email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'em-err' : 'em-hint'}
            onChange={(e) => set('email', e.target.value)}
          />
          {errors.email ? (
            <FieldError id="em-err">{errors.email}</FieldError>
          ) : (
            <span className="sb-hint" id="em-hint">
              {providers?.emailLinks ? 'هتدخل بيه، وهنبعتلك عليه رابط تأكيد.' : 'هتدخل بيه.'}
            </span>
          )}
        </div>
        <PasswordField
          id="pw"
          label="الباسورد"
          value={f.password}
          onChange={(v) => set('password', v)}
          error={errors.password ?? null}
          hint={`${MIN_PASSWORD} حروف أو أرقام على الأقل.`}
          autoComplete="new-password"
        />
        <button
          type="submit"
          className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
          aria-busy={busy}
        >
          اعمل الحساب
        </button>
        <p className="sb-small" style={{ textAlign: 'center' }}>
          عندك حساب؟{' '}
          <Link href="/login" className="ul">
            سجّل دخولك
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
