'use client';

import { Banner } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { ApiError } from '@/lib/api';
import type { AdminRole } from '@/lib/auth';
import { listKinds, type KindRow } from '@/lib/catalog';

const CURATORS: AdminRole[] = ['super_admin', 'support'];

/**
 * Faculty kinds — the fields students browse («الهندسة» across universities) and their texts (Phase 11).
 * Universities and their faculties live under /universities. Changes appear within 5 minutes.
 */
export function CatalogHome() {
  return (
    <AdminShell title="أنواع الكليات">
      {(admin) =>
        CURATORS.includes(admin.adminRole) ? (
          <Body />
        ) : (
          <Banner kind="warning" title="مش متاح">
            إدارة الكليات للمدير والدعم بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Body() {
  const [kinds, setKinds] = useState<KindRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listKinds()
      .then(setKinds)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب البيانات.'),
      );
  }, []);

  if (error) {
    return (
      <Banner kind="error" title="حصلت مشكلة">
        {error}
      </Banner>
    );
  }

  return (
    <>
      <p className="sb-small">
        النصوص العامة لكل مجال (بتظهر في صفحة الكلية على الموقع). الجامعات وكلياتها ولوجوهاتها من{' '}
        <Link href="/universities">الجامعات والكليات</Link>. التعديلات بتظهر خلال 5 دقايق.
      </p>
      <section className="sb-card adm-table-card" aria-labelledby="h-kinds">
        <h2 className="sb-h3 adm-card-title" id="h-kinds">
          أنواع الكليات
        </h2>
        {!kinds ? (
          <div aria-busy="true" style={{ minHeight: 160 }} />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">الكلية</th>
                <th scope="col">في كام جامعة</th>
                <th scope="col">تجارب الخريجين</th>
                <th scope="col">الحالة</th>
                <th scope="col">
                  <span className="adm-sr">تعديل</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {kinds.map((k) => (
                <tr key={k.id}>
                  <td>
                    <b>{k.fullNameAr}</b>
                    <span className="sb-caption" dir="ltr">
                      /faculty/{k.slug}
                    </span>
                  </td>
                  <td className="sb-num">{k._count.faculties}</td>
                  <td className="sb-num">{k._count.insights}</td>
                  <td>
                    <span
                      className={`sb-badge ${k.isActive ? 'sb-badge--success' : 'sb-badge--neutral'}`}
                    >
                      {k.isActive ? 'ظاهرة' : 'مخفية'}
                    </span>
                  </td>
                  <td>
                    <Link className="sb-btn sb-btn--secondary sb-btn--sm" href={`/catalog/${k.id}`}>
                      عدّل
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
