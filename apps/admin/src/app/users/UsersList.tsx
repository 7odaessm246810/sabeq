'use client';

import { Banner, EmptyState, useToast } from '@sabeq/ui';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Pager } from '@/components/Pager';
import { ReasonModal } from '@/components/ReasonModal';
import { Select } from '@/components/Select';
import { listUsers, setUserStatus, type UserRow } from '@/lib/dashboard';
import { formatDate, type PageInfo } from '@/lib/verification';

const ROLES = [
  ['student', 'طلبة'],
  ['mentor', 'مرشدين'],
] as const;
const STATUSES = [
  ['active', 'شغال'],
  ['suspended', 'موقوف'],
] as const;

/** Website accounts (Phase 20): find one, suspend it (signed out at once) or bring it back. */
export function UsersList() {
  return (
    <AdminShell title="الحسابات">
      {(admin) =>
        ['super_admin', 'support'].includes(admin.adminRole) ? (
          <Body />
        ) : (
          <Banner kind="warning" title="مش متاح">
            الحسابات للدعم بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Body() {
  const toast = useToast();
  const params = useSearchParams();
  const [role, setRole] = useState(params.get('role') ?? '');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{ items: UserRow[]; page: PageInfo } | null>(null);
  const [acting, setActing] = useState<UserRow | null>(null);

  useEffect(() => {
    let live = true;
    listUsers({ q: search, role, status, page })
      .then((d) => live && setData(d))
      .catch(() => live && setData({ items: [], page: { page: 1, pageSize: 30, total: 0 } }));
    return () => {
      live = false;
    };
  }, [search, role, status, page, reload]);

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
            placeholder="الاسم، رقم الموبايل أو الإيميل"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <div className="adm-filters">
          <label className="sb-label" htmlFor="role">
            النوع
          </label>
          <Select
            id="role"
            value={role}
            placeholder="الكل"
            options={ROLES}
            onChange={(v) => {
              setRole(v);
              setPage(1);
            }}
          />
          <label className="sb-label" htmlFor="status">
            الحالة
          </label>
          <Select
            id="status"
            value={status}
            placeholder="الكل"
            options={STATUSES}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          />
        </div>
      </div>
      <div className="sb-card adm-table-card">
        {!data ? (
          <div aria-busy="true" style={{ minHeight: 200 }} />
        ) : data.items.length === 0 ? (
          <EmptyState title="مفيش حسابات" description="مفيش حسابات بالفلتر ده." />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">الحساب</th>
                <th scope="col">النوع</th>
                <th scope="col">الحجوزات</th>
                <th scope="col">من إمتى</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.name ?? 'من غير اسم'}</b>
                    <span className="sb-caption adm-ltr">{u.phone}</span>
                  </td>
                  <td>
                    {u.role === 'mentor' ? 'مرشد' : 'طالب'}
                    {u.mentor ? (
                      <span className="sb-caption">
                        {u.mentor.listed ? 'ظاهر في البحث' : 'مش ظاهر'}
                      </span>
                    ) : null}
                    {u.status === 'suspended' ? (
                      <span className="sb-badge sb-badge--neutral">موقوف</span>
                    ) : null}
                  </td>
                  <td className="sb-num">{u.bookings}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={
                        u.status === 'active'
                          ? 'sb-btn sb-btn--ghost sb-btn--sm adm-danger'
                          : 'sb-btn sb-btn--secondary sb-btn--sm'
                      }
                      onClick={() => setActing(u)}
                    >
                      {u.status === 'active' ? 'وقّف الحساب' : 'رجّع الحساب'}
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
          title={
            acting.status === 'active'
              ? `توقّف حساب ${acting.name ?? acting.phone}؟`
              : `ترجّع حساب ${acting.name ?? acting.phone}؟`
          }
          description={
            acting.status === 'active'
              ? 'هيخرج من كل أجهزته فورًا ومش هيقدر يدخل تاني لحد ما ترجّعه. لو مرشد، هيختفي من البحث.'
              : 'هيقدر يدخل تاني عادي.'
          }
          confirmLabel={acting.status === 'active' ? 'وقّف الحساب' : 'رجّع الحساب'}
          danger={acting.status === 'active'}
          onClose={() => setActing(null)}
          onConfirm={async (note) => {
            await setUserStatus(
              acting.id,
              acting.status === 'active' ? 'suspended' : 'active',
              note,
            );
            toast({
              kind: 'success',
              title: acting.status === 'active' ? 'اتوقف الحساب' : 'رجع الحساب',
            });
            setReload((n) => n + 1);
          }}
        />
      ) : null}
    </>
  );
}
