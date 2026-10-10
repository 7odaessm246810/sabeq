'use client';

import { Banner, EmptyState, Modal, Tabs, useToast } from '@sabeq/ui';
import { formatEgyptianMobile } from '@sabeq/utils';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Money } from '@/components/Money';
import { Pager } from '@/components/Pager';
import { ApiError } from '@/lib/api';
import {
  PAYOUT_METHOD_LABELS,
  egp,
  listBalances,
  listPayouts,
  recordPayout,
  revealPayoutAccount,
  type BalanceRow,
  type PayoutDetails,
  type PayoutRow,
} from '@/lib/dashboard';
import { formatDate, type PageInfo } from '@/lib/verification';

/**
 * Paying mentors (Phase 20, finance): who is owed what. Finance transfers outside Sabeq (bank /
 * InstaPay / Vodafone Cash), then records it here with the transfer's reference number.
 */
export function Payouts() {
  return (
    <AdminShell title="فلوس المرشدين">
      {(admin) =>
        ['super_admin', 'finance'].includes(admin.adminRole) ? (
          <Body />
        ) : (
          <Banner kind="warning" title="مش متاح">
            التحويلات للمالية بس.
          </Banner>
        )
      }
    </AdminShell>
  );
}

function Details({ d }: { d: PayoutDetails }) {
  if (d.method === 'vodafone_cash')
    return (
      <p>
        فودافون كاش: <b className="adm-ltr">{formatEgyptianMobile(d.phone)}</b>
      </p>
    );
  if (d.method === 'instapay')
    return (
      <p>
        InstaPay: <b className="adm-ltr">{d.address}</b>
      </p>
    );
  return (
    <ul className="adm-list">
      <li>
        <span className="sb-small">البنك</span>
        <b>{d.bankName}</b>
      </li>
      <li>
        <span className="sb-small">صاحب الحساب</span>
        <b>{d.accountHolder}</b>
      </li>
      <li>
        <span className="sb-small">رقم الحساب / IBAN</span>
        <b className="adm-ltr">{d.accountNumber}</b>
      </li>
    </ul>
  );
}

function Body() {
  const toast = useToast();
  const [tab, setTab] = useState<'owed' | 'history'>('owed');
  const [reload, setReload] = useState(0);
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [history, setHistory] = useState<{ items: PayoutRow[]; page: PageInfo } | null>(null);
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<BalanceRow | null>(null);
  const [details, setDetails] = useState<PayoutDetails | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (tab === 'owed')
      listBalances()
        .then((b) => live && setBalances(b))
        .catch(() => live && setBalances([]));
    else
      listPayouts(page)
        .then((h) => live && setHistory(h))
        .catch(() => live && setHistory({ items: [], page: { page: 1, pageSize: 30, total: 0 } }));
    return () => {
      live = false;
    };
  }, [tab, page, reload]);

  function open(row: BalanceRow) {
    setPaying(row);
    setDetails(null);
    setAmount(String(row.balanceEgp));
    setReference('');
    setError(null);
    // Opening the full details is audited.
    revealPayoutAccount(row.mentorId)
      .then(setDetails)
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'ما قدرناش نجيب بيانات التحويل.'),
      );
  }

  async function record() {
    if (!paying) return;
    setBusy(true);
    setError(null);
    try {
      const p = await recordPayout({
        mentorId: paying.mentorId,
        amountEgp: Number(amount),
        reference: reference.trim(),
      });
      toast({
        kind: 'success',
        title: `اتسجل تحويل ${egp(p.amountEgp)}`,
        description: `ووصل للمرشد إشعار. باقي له ${egp(p.balanceEgp)}.`,
      });
      setPaying(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.fields.amountEgp ?? err.fields.reference ?? err.message)
          : 'حصلت مشكلة. جرّب تاني.',
      );
    } finally {
      setBusy(false);
    }
  }

  const owed = balances?.filter((b) => b.balanceEgp > 0) ?? null;

  return (
    <>
      <Tabs
        label="فلوس المرشدين"
        value={tab}
        onChange={(t) => setTab(t)}
        items={[
          { key: 'owed', label: 'مستحق' },
          { key: 'history', label: 'التحويلات اللي اتعملت' },
        ]}
      />
      <div className="sb-card adm-table-card" style={{ marginTop: 16 }}>
        {tab === 'owed' ? (
          !owed ? (
            <div aria-busy="true" style={{ minHeight: 200 }} />
          ) : owed.length === 0 ? (
            <EmptyState title="مفيش فلوس مستحقة" description="كل المرشدين واخدين حقهم." />
          ) : (
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">المرشد</th>
                  <th scope="col">المستحق</th>
                  <th scope="col">طريقة الاستلام</th>
                  <th scope="col">آخر تحويل</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {owed.map((b) => (
                  <tr key={b.mentorId}>
                    <td>
                      <b>{b.name}</b>
                      <span className="sb-caption adm-ltr">{b.phone}</span>
                    </td>
                    <td>
                      <b>
                        <Money egp={b.balanceEgp} />
                      </b>
                    </td>
                    <td>
                      {b.account ? (
                        b.account.display
                      ) : (
                        <span className="adm-muted">لسه ما ضافهاش</span>
                      )}
                    </td>
                    <td>{b.lastPaidAt ? formatDate(b.lastPaidAt) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="sb-btn sb-btn--primary sb-btn--sm"
                        disabled={!b.account}
                        title={b.account ? undefined : 'المرشد لازم يضيف طريقة استلام الفلوس الأول'}
                        onClick={() => open(b)}
                      >
                        سجّل تحويل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : !history ? (
          <div aria-busy="true" style={{ minHeight: 200 }} />
        ) : history.items.length === 0 ? (
          <EmptyState title="مفيش تحويلات لسه" description="أول ما تسجل تحويل هيظهر هنا." />
        ) : (
          <table className="adm-table">
            <thead>
              <tr>
                <th scope="col">إمتى</th>
                <th scope="col">المرشد</th>
                <th scope="col">المبلغ</th>
                <th scope="col">الطريقة / المرجع</th>
                <th scope="col">مين سجله</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.paidAt)}</td>
                  <td>{p.mentor}</td>
                  <td>
                    <Money egp={p.amountEgp} />
                  </td>
                  <td>
                    {PAYOUT_METHOD_LABELS[p.method]}
                    {p.reference ? <span className="sb-caption adm-ltr">{p.reference}</span> : null}
                  </td>
                  <td>{p.by ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {tab === 'history' && history ? <Pager page={history.page} onPage={setPage} /> : null}

      {paying ? (
        <Modal
          title={`تحويل لـ ${paying.name}`}
          onClose={() => setPaying(null)}
          footer={
            <>
              <button
                type="button"
                className="sb-btn sb-btn--primary"
                disabled={busy || !details || !(Number(amount) > 0) || reference.trim().length < 3}
                aria-busy={busy}
                onClick={() => void record()}
              >
                سجّل التحويل
              </button>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                onClick={() => setPaying(null)}
              >
                إلغاء
              </button>
            </>
          }
        >
          <div className="adm-modal-body">
            <Banner kind="info" title="حوّل الأول من البنك أو InstaPay، وبعدين سجّل هنا.">
              فتح البيانات دي بيتسجل في سجل العمليات.
            </Banner>
            {details ? (
              <Details d={details} />
            ) : !error ? (
              <div aria-busy="true" style={{ minHeight: 40 }} />
            ) : null}
            <div className="sb-field">
              <label className="sb-label" htmlFor="amt">
                المبلغ (ج.م) — المستحق {egp(paying.balanceEgp)}
              </label>
              <input
                className="sb-input"
                id="amt"
                inputMode="decimal"
                dir="ltr"
                style={{ textAlign: 'right' }}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="sb-field">
              <label className="sb-label" htmlFor="ref">
                رقم العملية
              </label>
              <input
                className="sb-input"
                id="ref"
                dir="ltr"
                style={{ textAlign: 'right' }}
                maxLength={120}
                placeholder="من إيصال البنك أو InstaPay"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            {error ? (
              <p className="sb-small" role="alert" style={{ color: 'var(--error)' }}>
                {error}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
