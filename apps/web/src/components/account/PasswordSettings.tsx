'use client';

import { Banner, useToast } from '@sabeq/ui';
import { useState, type FormEvent } from 'react';
import { PasswordField, messageOf } from '@/components/auth/AuthParts';
import { ApiError } from '@/lib/api';
import { changePassword } from '@/lib/auth';

const MIN_PASSWORD = 8;

/**
 * Change the password (with the current one) — or, for accounts made with Google, add one so the
 * email works on its own too. Other devices are signed out; this one stays.
 */
export function PasswordSettings({ hasPassword }: { hasPassword: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{
    current?: string | undefined;
    password?: string | undefined;
    form?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN_PASSWORD) {
      setErrors({ password: `الباسورد لازم ${MIN_PASSWORD} حروف أو أرقام على الأقل.` });
      return;
    }
    setBusy(true);
    try {
      await changePassword(next, hasPassword ? current : undefined);
      toast({
        kind: 'success',
        title: hasPassword ? 'الباسورد اتغيّر' : 'ضفنا الباسورد',
        description: 'خرّجنا أي جهاز تاني كان داخل بحسابك.',
      });
      setOpen(false);
      setCurrent('');
      setNext('');
      setErrors({});
    } catch (err) {
      const fields = err instanceof ApiError ? err.fields : {};
      setErrors(
        fields.current || fields.password
          ? { current: fields.current, password: fields.password }
          : { form: messageOf(err) },
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button
        type="button"
        className="sb-btn sb-btn--secondary sb-btn--sm"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => setOpen(true)}
      >
        {hasPassword ? 'غيّر الباسورد' : 'ضيف باسورد'}
      </button>
    );

  return (
    <form className="email-form" onSubmit={(e) => void submit(e)} noValidate>
      {errors.form ? (
        <Banner kind="error" title="ما اتغيّرش">
          {errors.form}
        </Banner>
      ) : null}
      {hasPassword ? (
        <PasswordField
          id="pw-current"
          label="الباسورد الحالي"
          value={current}
          onChange={(v) => {
            setCurrent(v);
            setErrors({});
          }}
          error={errors.current ?? null}
          autoComplete="current-password"
        />
      ) : null}
      <PasswordField
        id="pw-new"
        label={hasPassword ? 'الباسورد الجديد' : 'الباسورد'}
        value={next}
        onChange={(v) => {
          setNext(v);
          setErrors({});
        }}
        error={errors.password ?? null}
        hint={`${MIN_PASSWORD} حروف أو أرقام على الأقل.`}
        autoComplete="new-password"
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="sb-btn sb-btn--primary sb-btn--sm" aria-busy={busy}>
          احفظ
        </button>
        <button
          type="button"
          className="sb-btn sb-btn--ghost sb-btn--sm"
          onClick={() => {
            setOpen(false);
            setErrors({});
          }}
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
