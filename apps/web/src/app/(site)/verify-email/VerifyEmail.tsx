'use client';

import { EmptyState, SuccessRing } from '@sabeq/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { verifyEmail } from '@/lib/notifications';

export function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const [result, setResult] = useState<
    { ok: true; email: string } | { ok: false; message: string } | null
  >(null);

  useEffect(() => {
    let live = true;
    verifyEmail(token)
      .then((s) => live && setResult({ ok: true, email: s.email ?? '' }))
      .catch(
        (err: unknown) =>
          live &&
          setResult({
            ok: false,
            message: err instanceof ApiError ? err.message : 'حصلت مشكلة. جرّب تاني.',
          }),
      );
    return () => {
      live = false;
    };
  }, [token]);

  return (
    <section className="sb-container page-body" style={{ maxWidth: 560, paddingTop: 64 }}>
      <div className="sb-card" style={{ padding: 32 }} aria-busy={result === null}>
        {result === null ? (
          <p className="sb-small">بنأكد الإيميل…</p>
        ) : result.ok ? (
          <div className="done-ok">
            <SuccessRing />
            <h1 className="sb-h2" style={{ fontSize: 26 }}>
              إيميلك اتأكد
            </h1>
            <p className="sb-lead" dir="auto">
              هنبعت إشعارات جلساتك على {result.email}.
            </p>
            <Link className="sb-btn sb-btn--primary" href="/sessions">
              جلساتي
            </Link>
          </div>
        ) : (
          <EmptyState
            title="ما قدرناش نأكد الإيميل"
            description={result.message}
            actions={
              <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/account">
                حسابي
              </Link>
            }
          />
        )}
      </div>
    </section>
  );
}
