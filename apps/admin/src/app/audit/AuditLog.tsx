'use client';

import { Banner, EmptyState } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Select } from '@/components/Select';
import { ApiError } from '@/lib/api';
import {
  ACTION_LABELS,
  formatDate,
  listAudit,
  type AuditEntry,
  type PageInfo,
} from '@/lib/verification';

const ENTITY_FILTERS = [
  ['mentor_application', 'طلبات المرشدين'],
  ['mentor_document', 'فتح المستندات'],
  ['user', 'الحسابات والدخول'],
  ['booking', 'الحجوزات'],
  ['review', 'التقييمات'],
  ['mentor', 'تحويلات المرشدين'],
] as const;

const ENTITY_LABELS: Record<string, string> = {
  user: 'حساب',
  review: 'تقييم',
  mentor: 'مرشد',
  mentor_document: 'مستند',
};

/** Append-only audit trail (the database refuses edits and deletes). Super admins only. */
export function AuditLog() {
  return (
    <AdminShell title="سجل العمليات">
      {(admin) =>
        admin.adminRole === 'super_admin' ? (
          <AuditBody />
        ) : (
          <Banner kind="warning" title="مش متاح">
            سجل العمليات للمدير بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function AuditBody() {
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AuditEntry[]; page: PageInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listAudit({ ...(entityType ? { entityType } : {}), page })
      .then((d) => {
        if (live) {
          setData(d);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب السجل.');
      });
    return () => {
      live = false;
    };
  }, [entityType, page]);

  const pages = data ? Math.max(1, Math.ceil(data.page.total / data.page.pageSize)) : 1;

  return (
    <>
      <div className="adm-filters">
        <label className="sb-label" htmlFor="ent">
          النوع
        </label>
        <Select
          id="ent"
          value={entityType}
          placeholder="الكل"
          options={ENTITY_FILTERS}
          onChange={(v) => {
            setEntityType(v);
            setPage(1);
          }}
        />
      </div>
      {error ? (
        <Banner kind="error" title="حصلت مشكلة">
          {error}
        </Banner>
      ) : null}
      <div className="sb-card adm-table-card">
        {!data ? (
          <div aria-busy="true" style={{ minHeight: 200 }} />
        ) : data.items.length === 0 ? (
          <EmptyState title="السجل فاضي" description="مفيش عمليات بالفلتر ده." />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">الوقت</th>
                <th scope="col">العملية</th>
                <th scope="col">مين</th>
                <th scope="col">على إيه</th>
                <th scope="col">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.createdAt)}</td>
                  <td>
                    <b>{ACTION_LABELS[e.action] ?? e.action}</b>
                    {(e.after as { note?: string } | null)?.note ? (
                      <span className="sb-caption">«{(e.after as { note: string }).note}»</span>
                    ) : null}
                  </td>
                  <td>
                    {e.actor?.fullName ?? e.actorRole}
                    <span className="sb-caption">{e.actorRole}</span>
                  </td>
                  <td>
                    {e.entityType === 'mentor_application' ? (
                      <Link href={`/applications/${e.entityId}`}>طلب مرشد</Link>
                    ) : e.entityType === 'booking' ? (
                      <Link href={`/bookings/${e.entityId}`}>حجز</Link>
                    ) : (
                      (ENTITY_LABELS[e.entityType] ?? e.entityType)
                    )}
                    <span className="sb-caption sb-num" dir="ltr">
                      {e.entityId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="sb-num" dir="ltr">
                    {e.ip ?? '—'}
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
            الأحدث
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
            الأقدم
          </button>
        </div>
      ) : null}
    </>
  );
}
