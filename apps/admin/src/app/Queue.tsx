'use client';

import { Banner, EmptyState, Tabs } from '@sabeq/ui';
import { formatEgyptianMobile } from '@sabeq/utils';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { ApiError } from '@/lib/api';
import {
  KIND_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  formatDate,
  listApplications,
  type PageInfo,
  type QueueItem,
  type ReviewStatus,
} from '@/lib/verification';

const TABS: ReviewStatus[] = [
  'submitted',
  'under_review',
  'changes_requested',
  'approved',
  'rejected',
];

/** Mentor applications waiting for review — oldest first, one tab per status. */
export function Queue() {
  return (
    <AdminShell title="طلبات المرشدين">
      {(admin) =>
        admin.adminRole === 'super_admin' || admin.adminRole === 'verifier' ? (
          <QueueBody />
        ) : (
          <Banner kind="info" title="مراجعة الطلبات للمراجعين بس">
            {admin.adminRole === 'support' ? (
              <>
                تقدر تدير <Link href="/catalog">الكليات والجامعات</Link>.
              </>
            ) : (
              'الأقسام الخاصة بدورك هتظهر هنا في المراحل الجاية.'
            )}
          </Banner>
        )
      }
    </AdminShell>
  );
}

function QueueBody() {
  const [status, setStatus] = useState<ReviewStatus>('submitted');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: QueueItem[];
    counts: Partial<Record<ReviewStatus, number>>;
    page: PageInfo;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listApplications(status, page)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب الطلبات.');
      });
    return () => {
      live = false;
    };
  }, [status, page]);

  const pages = data ? Math.max(1, Math.ceil(data.page.total / data.page.pageSize)) : 1;

  return (
    <>
      <Tabs
        label="حالة الطلب"
        value={status}
        onChange={(s) => {
          setStatus(s);
          setPage(1);
        }}
        items={TABS.map((s) => ({
          key: s,
          label: `${STATUS_LABELS[s]}${data?.counts[s] ? ` (${data.counts[s]})` : ''}`,
        }))}
      />
      {error ? (
        <Banner kind="error" title="حصلت مشكلة">
          {error}
        </Banner>
      ) : null}
      <div className="sb-card adm-table-card">
        {!data ? (
          <div aria-busy="true" style={{ minHeight: 200 }} />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="مفيش طلبات هنا"
            description="أول ما يوصل طلب جديد هيظهر في القايمة دي."
          />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">المتقدم</th>
                <th scope="col">الصفة</th>
                <th scope="col">الدراسة</th>
                <th scope="col">اتبعت</th>
                <th scope="col">الحالة</th>
                <th scope="col">
                  <span className="adm-sr">فتح</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <td>
                    <b>{a.applicant.fullName ?? '—'}</b>
                    <span className="sb-caption sb-num adm-ltr" dir="ltr">
                      {formatEgyptianMobile(a.applicant.phone)}
                    </span>
                  </td>
                  <td>{a.kind ? KIND_LABELS[a.kind] : '—'}</td>
                  <td>
                    {a.major ?? '—'}
                    <span className="sb-caption">{a.faculty ?? ''}</span>
                  </td>
                  <td>{formatDate(a.submittedAt)}</td>
                  <td>
                    <span className={`sb-badge ${STATUS_BADGE[a.status]}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                    {a.reviewer ? <span className="sb-caption">{a.reviewer}</span> : null}
                  </td>
                  <td>
                    <Link
                      className="sb-btn sb-btn--secondary sb-btn--sm"
                      href={`/applications/${a.id}`}
                    >
                      راجع
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {pages > 1 ? (
        <div className="adm-pager">
          <button
            type="button"
            className="sb-btn sb-btn--ghost sb-btn--sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            السابق
          </button>
          <span className="sb-small sb-num">
            {page} / {pages}
          </span>
          <button
            type="button"
            className="sb-btn sb-btn--ghost sb-btn--sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </button>
        </div>
      ) : null}
    </>
  );
}
