'use client';

import { ACCREDITATION_LABELS, UNIVERSITY_TYPE_LABELS } from '@sabeq/types';
import { Banner, Icon, Modal, OrgLogo, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { LogoField } from '@/components/LogoField';
import { UniversityForm } from '@/components/UniversityForm';
import { ApiError } from '@/lib/api';
import {
  deleteUniversity,
  getUniversity,
  updateUniversity,
  type UniversityDetail,
} from '@/lib/catalog';

const WEB = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'حصلت مشكلة. جرّب تاني.';

export function UniversityEditor({ id }: { id: string }) {
  return (
    <AdminShell title="الجامعة">
      {(admin) =>
        admin.adminRole === 'super_admin' || admin.adminRole === 'support' ? (
          <Editor id={id} />
        ) : (
          <Banner kind="warning" title="مش متاح">
            إدارة الجامعات والكليات للمدير والدعم بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Editor({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const [uni, setUni] = useState<UniversityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const reload = useCallback(
    () =>
      getUniversity(id)
        .then(setUni)
        .catch((err: unknown) => setError(errorText(err))),
    [id],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) {
    return (
      <Banner kind="error" title="حصلت مشكلة">
        {error}
      </Banner>
    );
  }
  if (!uni) return <div aria-busy="true" style={{ minHeight: 320 }} />;

  async function remove() {
    try {
      await deleteUniversity(id);
      toast({ kind: 'success', title: 'الجامعة اتمسحت' });
      router.replace('/universities');
    } catch (err) {
      setConfirmDelete(false);
      toast({ kind: 'error', title: errorText(err) });
    }
  }

  return (
    <>
      <div className="adm-back">
        <Link href="/universities" className="sb-btn sb-btn--ghost sb-btn--sm">
          <Icon name="chevR" />
          كل الجامعات
        </Link>
        {uni.isActive ? (
          <a
            className="sb-btn sb-btn--ghost sb-btn--sm"
            href={`${WEB}/explore?university=${uni.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            شوفها في الموقع
          </a>
        ) : null}
      </div>

      <div className="adm-grid">
        <section className="sb-card adm-sec" aria-labelledby="h-uni">
          <h2 className="sb-h3" id="h-uni">
            بيانات الجامعة
          </h2>
          <LogoField
            owner="universities"
            id={uni.id}
            name={uni.nameAr}
            logo={uni.logo}
            onChange={(logo) => setUni({ ...uni, logo })}
          />
          <UniversityForm
            key={uni.adminEditedAt ?? uni.id}
            initial={{
              nameAr: uni.nameAr,
              nameEn: uni.nameEn,
              type: uni.type,
              governorate: uni.governorate,
              website: uni.website,
              isActive: uni.isActive,
            }}
            submitLabel="احفظ"
            onSubmit={async (input) => {
              setUni(await updateUniversity(uni.id, input));
              toast({ kind: 'success', title: 'اتحفظت' });
            }}
          />
          <p className="sb-caption">
            {UNIVERSITY_TYPE_LABELS[uni.type]} · الرابط: <span dir="ltr">{uni.slug}</span>
            {uni.sourceUrl ? (
              <>
                {' '}
                ·{' '}
                <a href={uni.sourceUrl} target="_blank" rel="noopener noreferrer">
                  مصدر البيانات
                </a>
              </>
            ) : null}
          </p>
          <div className="adm-danger-zone">
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-btn--sm adm-danger"
              onClick={() => setConfirmDelete(true)}
            >
              امسح الجامعة
            </button>
            <span className="sb-caption">
              بيتمسح بس لو مفيهاش كليات. عشان تخفيها من الموقع شيل علامة «ظاهرة في الموقع».
            </span>
          </div>
        </section>

        <section className="sb-card adm-sec" aria-labelledby="h-facs">
          <div className="adm-sec-head">
            <h2 className="sb-h3" id="h-facs">
              الكليات <span className="sb-num sb-small">({uni.faculties.length})</span>
            </h2>
            <Link
              className="sb-btn sb-btn--primary sb-btn--sm"
              href={`/faculties/new?university=${uni.id}`}
            >
              <Icon name="plus" />
              كلية جديدة
            </Link>
          </div>
          {uni.faculties.length ? (
            <ul className="adm-list adm-fac-list">
              {uni.faculties.map((f) => (
                <li key={f.id}>
                  <span className="adm-org">
                    <OrgLogo src={f.logo ?? uni.logo} name={f.nameAr} size={36} />
                    <span>
                      <b className={f.isActive ? '' : 'adm-muted'}>{f.nameAr}</b>
                      <span className="sb-caption">
                        {f.kind.nameAr}
                        {f.city ? ` · ${f.city}` : ''} ·{' '}
                        {ACCREDITATION_LABELS[f.accreditationStatus]}
                        {f._count.mentors ? ` · ${f._count.mentors} مرشد` : ''}
                        {f.isActive ? '' : ' · مخفية'}
                      </span>
                    </span>
                  </span>
                  <Link className="sb-btn sb-btn--secondary sb-btn--sm" href={`/faculties/${f.id}`}>
                    عدّل
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sb-small">مفيش كليات لسه. ضيف أول كلية.</p>
          )}
        </section>
      </div>

      {confirmDelete ? (
        <Modal
          title="تمسح الجامعة؟"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                onClick={() => setConfirmDelete(false)}
              >
                لا، ارجع
              </button>
              <button type="button" className="adm-btn-danger sb-btn" onClick={() => void remove()}>
                امسحها نهائيًا
              </button>
            </>
          }
        >
          <p className="adm-modal-body">
            «{uni.nameAr}» هتتمسح نهائيًا ومش هينفع ترجع. لو عايز تخفيها بس، اقفل النافذة وشيل علامة
            «ظاهرة في الموقع».
          </p>
        </Modal>
      ) : null}
    </>
  );
}
