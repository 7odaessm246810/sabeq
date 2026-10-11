'use client';

import { Banner, FieldError, cx, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AuthCard,
  GoogleButton,
  PasswordField,
  messageOf,
  useAfterLogin,
  useGoogleEnabled,
} from '@/components/auth/AuthParts';
import { api } from '@/lib/api';
import { useAuth, type AuthUser } from '@/lib/auth';
import { useDemo } from '@/lib/demo-store';

/** What the Google callback reports back in `?google=` (see auth.routes). */
const GOOGLE_PROBLEMS: Record<string, string> = {
  cancelled: 'الدخول بجوجل اتلغى. جرّب تاني أو ادخل بالإيميل.',
  failed: 'ما قدرناش نكمّل الدخول بجوجل. جرّب تاني.',
  admin: 'الحساب ده للوحة الإدارة. سجّل دخولك من هناك.',
  suspended: 'حسابك موقوف. كلّم الدعم عشان نعرف نساعدك.',
  off: 'الدخول بجوجل مش متاح دلوقتي. ادخل بالإيميل والباسورد.',
};

/** Email + password, or Google (ADR-0017). New here → /register. */
export function LoginFlow() {
  const auth = useAuth();
  const toast = useToast();
  const router = useRouter();
  const demo = useDemo();
  const params = useSearchParams();
  const afterLogin = useAfterLogin();
  const google = useGoogleEnabled();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const googleResult = params.get('google');
  const handled = useRef(false);

  // Back from Google: the API set the session cookie; read who we are and continue.
  useEffect(() => {
    if (handled.current || (googleResult !== 'ok' && googleResult !== 'new')) return;
    handled.current = true;
    api<{ user: AuthUser }>('/auth/me')
      .then(async ({ user }) => {
        await auth.refresh();
        const first = user.fullName?.split(' ')[0];
        toast({ kind: 'success', title: first ? `أهلًا ${first}` : 'أهلًا بيك في سابق' });
        await afterLogin(user, googleResult === 'new');
      })
      .catch(() => router.replace('/login?google=failed'));
  }, [googleResult, auth, router, toast, afterLogin]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'اكتب الإيميل.';
    if (!password) next.password = 'اكتب الباسورد.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const user = await auth.login(email.trim(), password);
      const first = user.fullName?.split(' ')[0];
      toast({
        kind: 'success',
        title: first ? `أهلًا ${first}` : 'أهلًا بيك',
        description: 'سجلت دخولك.',
      });
      await afterLogin(user, false);
    } catch (err) {
      setErrors({ form: messageOf(err) });
      setBusy(false);
    }
  }

  if (googleResult === 'ok' || googleResult === 'new')
    return <section className="auth" aria-busy="true" />;

  const problem = googleResult ? GOOGLE_PROBLEMS[googleResult] : undefined;
  const mentorFirst = demo.after?.startsWith('/become-mentor');

  return (
    <AuthCard title="سجّل دخولك" lead="أهلًا بيك تاني في سابق.">
      {problem ? (
        <Banner kind="error" title="ما دخلناش">
          {problem}
        </Banner>
      ) : null}
      {google ? (
        <GoogleButton role={mentorFirst ? 'mentor' : 'student'} label="ادخل بحساب جوجل" />
      ) : null}
      <form className="auth-body" onSubmit={(e) => void submit(e)} noValidate>
        {errors.form ? (
          <Banner kind="error" title="ما دخلناش">
            {errors.form}
          </Banner>
        ) : null}
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
            value={email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'em-err' : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors({});
            }}
          />
          {errors.email ? <FieldError id="em-err">{errors.email}</FieldError> : null}
        </div>
        <PasswordField
          id="pw"
          label="الباسورد"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setErrors({});
          }}
          error={errors.password ?? null}
          autoComplete="current-password"
        />
        <button
          type="submit"
          className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
          aria-busy={busy}
        >
          دخول
        </button>
        <div className="auth-links">
          <Link href="/forgot-password" className="ul">
            نسيت الباسورد؟
          </Link>
          <span>
            معندكش حساب؟{' '}
            <Link href="/register" className="ul">
              اعمل حساب
            </Link>
          </span>
        </div>
      </form>
    </AuthCard>
  );
}
