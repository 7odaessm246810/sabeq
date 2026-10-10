'use client';

import { Banner, EmptyState } from '@sabeq/ui';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Money } from '@/components/Money';
import { Pager } from '@/components/Pager';
import { Select } from '@/components/Select';
import { ApiError } from '@/lib/api';
import {
  BOOKING_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  listBookings,
  type BookingRow,
} from '@/lib/dashboard';
import { formatDate, type PageInfo } from '@/lib/verification';

const STATUS_OPTIONS = (
  ['confirmed', 'completed', 'cancelled', 'refunded', 'no_show'] as const
).map((s) => [s, BOOKING_STATUS_LABELS[s]] as const);

/** All bookings (Phase 20): by status, or a name / phone / booking id. */
export function BookingsList() {
  return (
    <AdminShell title="الحجوزات">
      {(admin) =>
        ['super_admin', 'support', 'finance'].includes(admin.adminRole) ? (
          <Body />
        ) : (
          <Banner kind="warning" title="مش متاح">
            الحجوزات للدعم والمالية بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Body() {
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: BookingRow[]; page: PageInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listBookings({ status, q: search, page })
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch(
        (err: unknown) =>
          live && setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب الحجوزات.'),
      );
    return () => {
      live = false;
    };
  }, [status, search, page]);

  return (
    <>
      <div className="adm-toolbar">
        <form
          className="adm-toolbar-search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(q.trim());
          }}
        >
          <input
            className="sb-input"
            type="search"
            aria-label="دوّر"
            placeholder="اسم الطالب أو المرشد، رقم الموبايل، أو رقم الحجز"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <div className="adm-filters">
          <label className="sb-label" htmlFor="st">
            الحالة
          </label>
          <Select
            id="st"
            value={status}
            placeholder="الكل"
            options={STATUS_OPTIONS}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        </div>
      </div>
      {error ? <Banner kind="error" title={error} /> : null}
      <div className="sb-card adm-table-card">
        {!data ? (
          <div aria-busy="true" style={{ minHeight: 200 }} />
        ) : data.items.length === 0 ? (
          <EmptyState title="مفيش حجوزات" description="مفيش حجوزات بالفلتر ده." />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">الميعاد</th>
                <th scope="col">الطالب</th>
                <th scope="col">المرشد</th>
                <th scope="col">الحالة</th>
                <th scope="col">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/bookings/${b.id}`}>{formatDate(b.startsAt)}</Link>
                    <span className="sb-caption">{b.label}</span>
                  </td>
                  <td>{b.student}</td>
                  <td>{b.mentor}</td>
                  <td>{BOOKING_STATUS_LABELS[b.status]}</td>
                  <td>
                    <Money egp={b.totalEgp} />
                    {b.payment ? (
                      <span className="sb-caption">
                        {PAYMENT_STATUS_LABELS[b.payment] ?? b.payment}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data ? <Pager page={data.page} onPage={setPage} /> : null}
    </>
  );
}
