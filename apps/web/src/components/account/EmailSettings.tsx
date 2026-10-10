'use client';

import { Banner, Icon, useToast } from '@sabeq/ui';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { getEmail, removeEmail, resendEmail, setEmail, type EmailState } from '@/lib/notifications';

const errorText = (err: unknown) =>
  err instanceof ApiError ? (err.fields.email ?? err.message) : 'حصلت مشكلة. جرّب تاني.';

/**
 * «إشعارات الإيميل» in the account (Phase 19): add an address, confirm it from the emailed link,
 * change or remove it. Only a confirmed address gets emails.
 */
export function EmailSettings() {
  const toast = useToast();
  const [state, setState] = useState<EmailState | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getEmail()
      .then((s) => live && setState(s))
      .catch(() => live && setState({ email: null, verified: false }));
    return () => {
      live = false;
    };
  }, []);

  async function run(work: () => Promise<EmailState>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await work();
      setState(next);
      setEditing(false);
      if (done) toast({ kind: 'success', title: done });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div aria-busy="true" style={{ minHeight: 80 }} />;

  if (!state.email || editing)
    return (
      <form
        className="email-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => setEmail(draft), 'بعتنالك رابط التأكيد');
        }}
      >
        <div className={error ? 'sb-field sb-field--error' : 'sb-field'}>
          <label className="sb-label" htmlFor="em">
            الإيميل
          </label>
          <input
            className="sb-input"
            id="em"
            type="email"
            dir="ltr"
            style={{ textAlign: 'right' }}
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            placeholder="name@example.com"
            value={draft}
            aria-invalid={Boolean(error)}
            aria-describedby="em-hint"
            onChange={(e) => setDraft(e.target.value)}
          />
          <span className="sb-hint" id="em-hint" role={error ? 'alert' : undefined}>
            {error ?? 'هنبعتلك عليه تأكيد الحجز وتذكير قبل الجلسة. مش هنبعت إعلانات.'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            className="sb-btn sb-btn--primary sb-btn--sm"
            disabled={busy || !draft.trim()}
            aria-busy={busy}
          >
            ابعت رابط التأكيد
          </button>
          {editing ? (
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-btn--sm"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              إلغاء
            </button>
          ) : null}
        </div>
      </form>
    );

  return (
    <div className="email-form">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b dir="ltr">{state.email}</b>
        {state.verified ? (
          <span className="sb-badge sb-badge--success">
            <Icon name="check" />
            متأكد
          </span>
        ) : (
          <span className="sb-badge sb-badge--warning">
            <Icon name="clock" />
            مستني التأكيد
          </span>
        )}
      </div>
      {!state.verified ? (
        <Banner kind="info" title="افتح الرابط اللي بعتناه على الإيميل ده.">
          الإيميلات بتبدأ توصلك بعد التأكيد. الرابط شغال 24 ساعة.
        </Banner>
      ) : null}
      {state.devLink ? (
        <Banner kind="warning" title="للتجربة على جهازك — مفيش إيميل بيتبعت فعلًا">
          <a className="ul" href={state.devLink}>
            افتح رابط التأكيد
          </a>
        </Banner>
      ) : null}
      {error ? (
        <p className="sb-small" role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      ) : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!state.verified ? (
          <button
            type="button"
            className="sb-btn sb-btn--secondary sb-btn--sm"
            disabled={busy}
            onClick={() => void run(resendEmail, 'بعتنا الرابط تاني')}
          >
            ابعت الرابط تاني
          </button>
        ) : null}
        <button
          type="button"
          className="sb-btn sb-btn--ghost sb-btn--sm"
          disabled={busy}
          onClick={() => {
            setDraft(state.email ?? '');
            setEditing(true);
          }}
        >
          غيّر الإيميل
        </button>
        <button
          type="button"
          className="sb-btn sb-btn--ghost sb-btn--sm"
          style={{ color: 'var(--error)' }}
          disabled={busy}
          onClick={() => void run(removeEmail, 'شلنا الإيميل ووقفنا الإيميلات')}
        >
          شيل الإيميل
        </button>
      </div>
    </div>
  );
}
