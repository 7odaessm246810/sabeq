'use client';

import { PAYOUT_METHOD_LABELS, type PayoutDetails, type PayoutMethod } from '@sabeq/types';
import { formatCairoDay } from '@sabeq/utils';
import { Banner, useToast } from '@sabeq/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { Field, Select } from '@/components/form';
import { ApiError } from '@/lib/api';
import {
  getEarnings,
  getPayoutAccount,
  setPayoutAccount,
  type Earnings,
  type PayoutAccount,
} from '@/lib/payouts';

const METHODS = (['instapay', 'vodafone_cash', 'bank_transfer'] as const).map(
  (m) => [m, PAYOUT_METHOD_LABELS[m]] as const,
);

/**
 * «فلوسك» on the mentor's account (Phase 20): what they earned, what was transferred, and where
 * transfers go. The details are stored encrypted and shown back masked.
 */
export function MentorMoney() {
  const toast = useToast();
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [account, setAccount] = useState<PayoutAccount | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<PayoutMethod | ''>('');
  const [f, setF] = useState({
    address: '',
    phone: '',
    bankName: '',
    accountHolder: '',
    accountNumber: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getEarnings()
      .then((e) => live && setEarnings(e))
      .catch(() => undefined);
    getPayoutAccount()
      .then((a) => live && setAccount(a))
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!method) {
      setErrors({ method: 'اختار طريقة الاستلام.' });
      return;
    }
    const details: PayoutDetails =
      method === 'instapay'
        ? { method, address: f.address }
        : method === 'vodafone_cash'
          ? { method, phone: f.phone }
          : {
              method,
              bankName: f.bankName,
              accountHolder: f.accountHolder,
              accountNumber: f.accountNumber,
            };
    setBusy(true);
    setErrors({});
    try {
      setAccount(await setPayoutAccount(details));
      setEditing(false);
      setF({ address: '', phone: '', bankName: '', accountHolder: '', accountNumber: '' });
      toast({ kind: 'success', title: 'اتحفظت طريقة الاستلام' });
    } catch (err) {
      setErrors(
        err instanceof ApiError
          ? { ...err.fields, _: err.message }
          : { _: 'حصلت مشكلة. جرّب تاني.' },
      );
    } finally {
      setBusy(false);
    }
  }

  const input = (
    key: keyof typeof f,
    label: string,
    opts: { ltr?: boolean; placeholder?: string; hint?: string } = {},
  ) => (
    <Field id={`po-${key}`} label={label} error={errors[key]} hint={opts.hint}>
      <input
        className="sb-input"
        id={`po-${key}`}
        dir={opts.ltr ? 'ltr' : undefined}
        style={opts.ltr ? { textAlign: 'right' } : undefined}
        placeholder={opts.placeholder}
        value={f[key]}
        aria-invalid={Boolean(errors[key])}
        onChange={(e) => setF((x) => ({ ...x, [key]: e.target.value }))}
      />
    </Field>
  );

  return (
    <div className="sb-card acct-card">
      <h2 className="sb-h3">فلوسك</h2>
      {earnings ? (
        <div className="money-row">
          <div>
            <span className="sb-small">مستحق ليك</span>
            <b>
              <span className="sb-num">{earnings.balanceEgp}</span> ج.م
            </b>
          </div>
          <div>
            <span className="sb-small">كسبت لحد دلوقتي</span>
            <b>
              <span className="sb-num">{earnings.earnedEgp}</span> ج.م
            </b>
          </div>
          <div>
            <span className="sb-small">اتحوّلك</span>
            <b>
              <span className="sb-num">{earnings.paidEgp}</span> ج.م
            </b>
          </div>
        </div>
      ) : (
        <div aria-busy="true" style={{ minHeight: 60 }} />
      )}
      <p className="sb-small">
        بتكسب سعر الجلسة ناقص 10% عمولة سابق، أول ما الجلسة تخلص. بنحوّلك المستحق على الطريقة اللي
        تختارها تحت.
      </p>

      {account === undefined ? null : account && !editing ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="sb-small">بنحوّلك على:</span>
          <b>{account.display}</b>
          <button
            type="button"
            className="sb-btn sb-btn--ghost sb-btn--sm"
            onClick={() => setEditing(true)}
          >
            غيّرها
          </button>
        </div>
      ) : (
        <form className="email-form" onSubmit={(e) => void save(e)} noValidate>
          {!account ? (
            <Banner kind="info" title="ضيف طريقة استلام فلوسك">
              من غيرها مش هنقدر نحوّلك المستحق.
            </Banner>
          ) : null}
          <Field id="po-method" label="طريقة الاستلام" error={errors.method}>
            <Select
              id="po-method"
              value={method}
              options={METHODS}
              error={errors.method}
              onChange={(v) => setMethod(v as PayoutMethod)}
            />
          </Field>
          {method === 'instapay'
            ? input('address', 'عنوان InstaPay', { ltr: true, placeholder: 'name@instapay' })
            : null}
          {method === 'vodafone_cash'
            ? input('phone', 'رقم فودافون كاش', { ltr: true, placeholder: '01xxxxxxxxx' })
            : null}
          {method === 'bank_transfer' ? (
            <>
              {input('bankName', 'اسم البنك', { placeholder: 'مثلًا: البنك الأهلي المصري' })}
              {input('accountHolder', 'اسم صاحب الحساب', {
                hint: 'زي ما هو مكتوب في البنك بالظبط.',
              })}
              {input('accountNumber', 'رقم الحساب أو الـ IBAN', { ltr: true, placeholder: 'EG…' })}
            </>
          ) : null}
          {errors._ && !Object.keys(errors).some((k) => k !== '_') ? (
            <p className="sb-small" role="alert" style={{ color: 'var(--error)' }}>
              {errors._}
            </p>
          ) : null}
          <span className="sb-caption">
            البيانات دي بتتحفظ مشفّرة، وفريق المالية بس اللي بيشوفها وقت التحويل.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              className="sb-btn sb-btn--primary sb-btn--sm"
              disabled={busy || !method}
              aria-busy={busy}
            >
              احفظ
            </button>
            {account ? (
              <button
                type="button"
                className="sb-btn sb-btn--ghost sb-btn--sm"
                onClick={() => setEditing(false)}
              >
                إلغاء
              </button>
            ) : null}
          </div>
        </form>
      )}

      {earnings?.payouts.length ? (
        <>
          <h3 className="sb-h4" style={{ marginTop: 8 }}>
            التحويلات
          </h3>
          <ul className="acct-devices">
            {earnings.payouts.map((p) => (
              <li key={p.id}>
                <span>
                  <b>
                    <span className="sb-num">{p.amountEgp}</span> ج.م
                  </b>{' '}
                  · {PAYOUT_METHOD_LABELS[p.method]}
                </span>
                <span className="sb-caption">{formatCairoDay(new Date(p.date))}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
