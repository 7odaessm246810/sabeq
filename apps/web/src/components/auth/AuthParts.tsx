'use client';

/**
 * Pieces shared by login, sign-up and the password pages (ADR-0017): the card, the Google button,
 * a password field with show / hide, and where to go once signed in.
 */
import { FieldError, Icon, Logo, cx } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { getProviders, googleSignInUrl, type AuthUser, type SignupRole } from '@/lib/auth';
import { useDemo } from '@/lib/demo-store';
import { getOwnMentor } from '@/lib/mentors';

export const messageOf = (err: unknown, field?: string) => {
  const e = err instanceof ApiError ? err : null;
  return (field && e?.fields[field]) || e?.message || 'حصلت مشكلة. جرّب تاني.';
};

export function AuthCard({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: ReactNode;
  children: ReactNode;
  /** Default: the terms line. `null` hides it. */
  footer?: ReactNode;
}) {
  return (
    <section className="auth">
      <div className="sb-card auth-card">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size={36} />
        </div>
        <div className="auth-body">
          <h1 className="sb-h2" style={{ fontSize: 26, textAlign: 'center' }}>
            {title}
          </h1>
          {lead ? (
            <p className="sb-small" style={{ textAlign: 'center' }}>
              {lead}
            </p>
          ) : null}
          {children}
        </div>
      </div>
      {footer !== undefined ? (
        footer
      ) : (
        <p className="sb-caption" style={{ textAlign: 'center', marginTop: 16 }}>
          بالمتابعة انت موافق على{' '}
          <Link href="/terms" className="ul">
            الشروط
          </Link>{' '}
          و
          <Link href="/privacy" className="ul">
            الخصوصية
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/** Whether "Sign in with Google" is configured (asked once per page). */
export function useGoogleEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    getProviders()
      .then((p) => live && setOn(p.google))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return on;
}

/** The colored "G" — Google's sign-in branding asks for its own mark on this button. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/** A plain link: Google sign-in is a full-page trip through the API. */
export function GoogleButton({ role, label }: { role: SignupRole; label: string }) {
  return (
    <>
      <a className="sb-btn sb-btn--secondary sb-btn--lg sb-btn--block" href={googleSignInUrl(role)}>
        <GoogleMark />
        {label}
      </a>
      <div className="auth-or" role="separator">
        <span>أو</span>
      </div>
    </>
  );
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  onEnter,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  hint?: string;
  autoComplete: 'current-password' | 'new-password';
  onEnter?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cx('sb-field', error && 'sb-field--error')}>
      <label className="sb-label" htmlFor={id}>
        {label}
      </label>
      <div className="pw">
        <input
          className="sb-input"
          id={id}
          type={shown ? 'text' : 'password'}
          dir="ltr"
          autoComplete={autoComplete}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) onEnter();
          }}
        />
        <button
          type="button"
          className="sb-btn sb-btn--ghost sb-btn--sm"
          aria-label={shown ? 'اخفي الباسورد' : 'اظهر الباسورد'}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {error ? (
        <FieldError id={`${id}-err`}>{error}</FieldError>
      ) : hint ? (
        <span className="sb-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Where a person goes once signed in: a new student fills «أهلًا بيك» first; a new mentor goes to
 * the application; everyone else continues where they were going (or to their usual home).
 */
export function useAfterLogin() {
  const router = useRouter();
  const demo = useDemo();
  return useCallback(
    async (user: AuthUser, isNew: boolean) => {
      if (user.role === 'student' && (isNew || user.needsProfile)) {
        router.push('/welcome');
        return;
      }
      const mentorHome = () =>
        getOwnMentor().then(
          () => '/account/mentor',
          () => (isNew ? '/become-mentor/apply' : '/become-mentor'),
        );
      const target = demo.after ?? (user.role === 'mentor' ? await mentorHome() : '/sessions');
      demo.setAfter(null);
      router.push(target);
    },
    [router, demo],
  );
}
