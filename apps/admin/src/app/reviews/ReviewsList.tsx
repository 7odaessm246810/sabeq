'use client';

import { Banner, EmptyState, Tabs, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Pager } from '@/components/Pager';
import { ReasonModal } from '@/components/ReasonModal';
import { listReviews, setReviewStatus, type ReviewRow } from '@/lib/dashboard';
import { formatDate, type PageInfo } from '@/lib/verification';

type Tab = 'published' | 'hidden';

/** Reviews (Phase 20): hide what breaks the rules, restore what was hidden by mistake. */
export function ReviewsList() {
  return (
    <AdminShell title="التقييمات">
      {(admin) =>
        ['super_admin', 'support'].includes(admin.adminRole) ? (
          <Body />
        ) : (
          <Banner kind="warning" title="مش متاح">
            التقييمات للدعم بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Body() {
  const toast = useToast();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('status') === 'hidden' ? 'hidden' : 'published');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ items: ReviewRow[]; page: PageInfo } | null>(null);
  const [acting, setActing] = useState<ReviewRow | null>(null);

  useEffect(() => {
    let live = true;
    listReviews({ status: tab, page })
      .then((d) => live && setData(d))
      .catch(() => live && setData({ items: [], page: { page: 1, pageSize: 30, total: 0 } }));
    return () => {
      live = false;
    };
  }, [tab, page, reload]);

  return (
    <>
      <Tabs
        label="التقييمات"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
          setData(null);
        }}
        items={[
          { key: 'published', label: 'ظاهرة' },
          { key: 'hidden', label: 'مخفية' },
        ]}
      />
      <div className="sb-card adm-table-card" style={{ marginTop: 16 }}>
        {!data ? (
          <div aria-busy="true" style={{ minHeight: 200 }} />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="مفيش تقييمات هنا"
            description={tab === 'hidden' ? 'محدش خفى تقييم.' : 'لسه محدش قيّم.'}
          />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">التقييم</th>
                <th scope="col">من / لمين</th>
                <th scope="col">إمتى</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>
                      <span className="sb-num">{r.rating}</span> من 5
                    </b>
                    {r.text ? <span className="sb-caption">«{r.text}»</span> : null}
                  </td>
                  <td>
                    {r.student}
                    <span className="sb-caption">
                      لـ {r.mentor} · <Link href={`/bookings/${r.bookingId}`}>الحجز</Link>
                    </span>
                  </td>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={
                        tab === 'published'
                          ? 'sb-btn sb-btn--ghost sb-btn--sm adm-danger'
                          : 'sb-btn sb-btn--secondary sb-btn--sm'
                      }
                      onClick={() => setActing(r)}
                    >
                      {tab === 'published' ? 'اخفيه' : 'رجّعه'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data ? <Pager page={data.page} onPage={setPage} /> : null}

      {acting ? (
        <ReasonModal
          title={tab === 'published' ? 'تخفي التقييم ده؟' : 'ترجّع التقييم ده؟'}
          description={
            tab === 'published'
              ? 'هيختفي من ملف المرشد وتقييمه هيتحسب من غيره.'
              : 'هيرجع يظهر في ملف المرشد ويدخل في تقييمه.'
          }
          confirmLabel={tab === 'published' ? 'اخفيه' : 'رجّعه'}
          danger={tab === 'published'}
          onClose={() => setActing(null)}
          onConfirm={async (note) => {
            await setReviewStatus(acting.id, tab === 'published' ? 'hidden' : 'published', note);
            toast({
              kind: 'success',
              title: tab === 'published' ? 'اتخفى التقييم' : 'رجع التقييم',
            });
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}
