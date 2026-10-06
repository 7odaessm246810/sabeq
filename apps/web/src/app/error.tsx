'use client';

import { EmptyState } from '@sabeq/ui';
import Link from 'next/link';

/**
 * Route-level error boundary. Design rule (UX Flows → Error): say what happened, whether money was
 * affected, and offer a retry. No technical codes on screen; `digest` links to the server log.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-pad page-in">
      <section className="sb-container page-body notfound-page">
        <div className="sb-card" role="alert">
          <EmptyState
            roomy
            title="حصلت مشكلة عندنا"
            description="الصفحة ما اتحملتش. ما اتخصمش أي مبلغ — جرّب تاني بعد ثواني."
            actions={
              <>
                <button type="button" className="sb-btn sb-btn--primary sb-btn--sm" onClick={reset}>
                  جرّب تاني
                </button>
                <Link className="sb-btn sb-btn--secondary sb-btn--sm" href="/">
                  الرئيسية
                </Link>
              </>
            }
          />
          {error.digest ? (
            <p className="sb-caption error-ref">
              رقم المرجع: <span className="sb-num">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
