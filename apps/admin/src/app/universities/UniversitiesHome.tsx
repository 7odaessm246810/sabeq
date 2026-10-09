'use client';

import { GOVERNORATES, UNIVERSITY_TYPE_LABELS, UNIVERSITY_TYPES } from '@sabeq/types';
import { Banner, Icon, Modal, OrgLogo } from '@sabeq/ui';
import { normalizeArabic } from '@sabeq/utils';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Select } from '@/components/Select';
import { UniversityForm } from '@/components/UniversityForm';
import { ApiError } from '@/lib/api';
import type { AdminRole } from '@/lib/auth';
import { createUniversity, listUniversities, type UniversityRow } from '@/lib/catalog';

const CURATORS: AdminRole[] = ['super_admin', 'support'];

/** Every university with its logo and faculties (Phase 11c). Changes reach the site within minutes. */
export function UniversitiesHome() {
  return (
    <AdminShell title="الجامعات والكليات">
      {(admin) =>
        CURATORS.includes(admin.adminRole) ? (
          <Body />
        ) : (
          <Banner kind="warning" title="مش متاح">
            إدارة الجامعات والكليات للمدير والدعم بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Body() {
  const router = useRouter();
  const [unis, setUnis] = useState<UniversityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [gov, setGov] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    listUniversities()
      .then(setUnis)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب الجامعات.'),
      );
  }, []);

  if (error) {
    return (
      <Banner kind="error" title="حصلت مشكلة">
        {error}
      </Banner>
    );
  }

  const nq = normalizeArabic(q);
  const list = (unis ?? []).filter(
    (u) =>
      (!nq || normalizeArabic(`${u.nameAr} ${u.nameEn ?? ''} ${u.slug}`).includes(nq)) &&
      (!type || u.type === type) &&
      (!gov || u.governorate === gov),
  );

  return (
    <>
      <div className="adm-toolbar">
        <div className="sb-search adm-toolbar-search">
          <div className="sb-search-box">
            <span className="i20">
              <Icon name="search" />
            </span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="دوّر باسم الجامعة"
              aria-label="دوّر باسم الجامعة"
            />
          </div>
        </div>
        <div className="adm-filters">
          <Select
            id="f-type"
            value={type}
            placeholder="كل الأنواع"
            options={UNIVERSITY_TYPES.map((t) => [t, UNIVERSITY_TYPE_LABELS[t]] as const)}
            onChange={setType}
          />
          <Select
            id="f-gov"
            value={gov}
            placeholder="كل المحافظات"
            options={GOVERNORATES.map((g) => [g, g] as const)}
            onChange={setGov}
          />
        </div>
        <button type="button" className="sb-btn sb-btn--primary" onClick={() => setAdding(true)}>
          <Icon name="plus" />
          جامعة جديدة
        </button>
      </div>
      <p className="sb-small">
        التعديلات بتظهر في الموقع خلال دقايق. الجامعات والكليات اللي بتضيفها أو تعدّلها هنا مش
        بتتغير لما بيانات البحث تتحدث.
      </p>

      <section className="sb-card adm-table-card" aria-label="الجامعات">
        {!unis ? (
          <div aria-busy="true" style={{ minHeight: 240 }} />
        ) : (
          <table className="adm-table">
            <caption className="adm-sr">الجامعات</caption>
            <thead>
              <tr>
                <th scope="col">الجامعة</th>
                <th scope="col">النوع</th>
                <th scope="col">المحافظة</th>
                <th scope="col">الكليات</th>
                <th scope="col">الحالة</th>
                <th scope="col">
                  <span className="adm-sr">تعديل</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="adm-org">
                      <OrgLogo src={u.logo} name={u.nameAr} size={36} />
                      <span>
                        <b>{u.nameAr}</b>
                        {u.nameEn ? (
                          <span className="sb-caption" dir="ltr">
                            {u.nameEn}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td>{UNIVERSITY_TYPE_LABELS[u.type]}</td>
                  <td>{u.governorate ?? '—'}</td>
                  <td className="sb-num">{u._count.faculties}</td>
                  <td>
                    <span
                      className={`sb-badge ${u.isActive ? 'sb-badge--success' : 'sb-badge--neutral'}`}
                    >
                      {u.isActive ? 'ظاهرة' : 'مخفية'}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="sb-btn sb-btn--secondary sb-btn--sm"
                      href={`/universities/${u.id}`}
                    >
                      افتح
                    </Link>
                  </td>
                </tr>
              ))}
              {!list.length ? (
                <tr>
                  <td colSpan={6} className="sb-small">
                    مفيش جامعة بالاسم ده.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>

      {adding ? (
        <Modal title="جامعة جديدة" onClose={() => setAdding(false)}>
          <UniversityForm
            submitLabel="ضيف الجامعة"
            onSubmit={async (input) => {
              const u = await createUniversity(input);
              router.push(`/universities/${u.id}`);
            }}
          />
        </Modal>
      ) : null}
    </>
  );
}
