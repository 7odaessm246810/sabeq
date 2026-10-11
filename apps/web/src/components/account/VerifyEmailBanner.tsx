'use client';

import { Banner } from '@sabeq/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { resendEmail } from '@/lib/notifications';

/** Booking waits for a confirmed email (ADR-0017): say so, and offer the link again. */
export function VerifyEmailBanner({ email }: { email: string | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState('busy');
    setError(null);
    try {
      const r = await resendEmail();
      setDevLink(r.devLink ?? null);
      setState('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'حصلت مشكلة. جرّب تاني.');
      setState('idle');
    }
  }

  return (
    <Banner
      kind="warning"
      title="أكّد إيميلك الأول عشان تقدر تحجز"
      action={
        <button
          type="button"
          className="sb-btn sb-btn--secondary sb-btn--sm"
          disabled={state !== 'idle'}
          aria-busy={state === 'busy'}
          onClick={() => void resend()}
        >
          {state === 'sent' ? 'بعتناه' : 'ابعت الرابط تاني'}
        </button>
      }
    >
      بعتنا رابط التأكيد على <span dir="ltr">{email}</span>. افتحه وارجع هنا.{' '}
      <Link className="ul" href="/account">
        الإيميل غلط؟
      </Link>
      {error ? <span role="alert"> {error}</span> : null}
      {devLink ? (
        <>
          {' '}
          <a className="ul" href={devLink}>
            (للتجربة: افتح الرابط)
          </a>
        </>
      ) : null}
    </Banner>
  );
}
