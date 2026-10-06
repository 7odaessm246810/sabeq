import { EmptyState } from '@sabeq/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'الصفحة مش موجودة' };

/** Prototype `P.notfound`. */
export default function NotFound() {
  return (
    <div className="page-pad page-in">
      <section className="sb-container page-body notfound-page">
        <div className="sb-card">
          <EmptyState
            roomy
            title="الصفحة دي مش موجودة"
            description="يمكن اللينك اتغير. ابدأ من الرئيسية أو دوّر على كلية."
            actions={
              <>
                <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/">
                  الرئيسية
                </Link>
                <Link className="sb-btn sb-btn--secondary sb-btn--sm" href="/explore">
                  استكشف الكليات
                </Link>
              </>
            }
          />
        </div>
      </section>
    </div>
  );
}
