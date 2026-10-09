'use client';

import { Banner, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { ApiError } from '@/lib/api';
import type { AdminRole } from '@/lib/auth';
import {
  listKinds,
  listUniversities,
  updateUniversity,
  type KindRow,
  type UniversityRow,
} from '@/lib/catalog';

const CURATORS: AdminRole[] = ['super_admin', 'support'];

/** Faculties and universities shown on the website (Phase 11). Changes appear there within 5 minutes. */
export function CatalogHome() {
  return (
    <AdminShell title="الكليات والجامعات">
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
  const toast = useToast();
  const [kinds, setKinds] = useState<KindRow[] | null>(null);
  const [unis, setUnis] = useState<UniversityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listKinds(), listUniversities()])
      .then(([k, u]) => {
        setKinds(k);
        setUnis(u);
      })
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب البيانات.'),
      );
  }, []);

  async function toggleUniversity(u: UniversityRow) {
    try {
      setUnis(await updateUniversity(u.id, { isActive: !u.isActive }));
      toast({
        kind: 'success',
        title: u.isActive ? 'الجامعة اتخفت من الموقع' : 'الجامعة ظهرت في الموقع',
      });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'جرّب تاني.' });
    }
  }

  if (error) {
    return (
      <Banner kind="error" title="حصلت مشكلة">
        {error}
      </Banner>
    );
  }

  return (
    <>
      <p className="sb-small">التعديلات بتظهر في الموقع خلال 5 دقايق.</p>
      <section className="sb-card adm-table-card" aria-labelledby="h-kinds">
        <h2 className="sb-h3 adm-card-title" id="h-kinds">
          الكليات
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

      <section className="sb-card adm-table-card" aria-labelledby="h-unis">
        <h2 className="sb-h3 adm-card-title" id="h-unis">
          الجامعات
        </h2>
        {!unis ? (
          <div aria-busy="true" style={{ minHeight: 160 }} />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">الجامعة</th>
                <th scope="col">المحافظة</th>
                <th scope="col">الكليات</th>
                <th scope="col">الحالة</th>
                <th scope="col">
                  <span className="adm-sr">إظهار أو إخفاء</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {unis.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.nameAr}</b>
                  </td>
                  <td>{u.governorate}</td>
                  <td className="sb-num">{u._count.faculties}</td>
                  <td>
                    <span
                      className={`sb-badge ${u.isActive ? 'sb-badge--success' : 'sb-badge--neutral'}`}
                    >
                      {u.isActive ? 'ظاهرة' : 'مخفية'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="sb-btn sb-btn--ghost sb-btn--sm"
                      onClick={() => void toggleUniversity(u)}
                    >
                      {u.isActive ? 'اخفيها' : 'اظهرها'}
                    </button>
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
