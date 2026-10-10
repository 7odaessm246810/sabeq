'use client';

import { formatEgyptianMobile } from '@sabeq/utils';
import { Icon, Modal, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmailSettings } from '@/components/account/EmailSettings';
import { ProfileForm } from '@/components/account/ProfileForm';
import { PageHead } from '@/components/PageHead';
import { getProfile, listDevices, signOutDevice, type Device, type Profile } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSignOut, useSignedIn } from '@/lib/use-signed-in';

const when = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

/** Profile, signed-in devices and sign-out — the account page (Phase 08; not in the design handoff). */
export function AccountClient() {
  const user = useSignedIn('/account');
  const { refresh } = useAuth();
  const signOut = useSignOut();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadDevices = useCallback(() => listDevices().then(setDevices), []);

  useEffect(() => {
    if (!user) return;
    Promise.all([getProfile().then(setProfile), loadDevices()]).catch(() => setFailed(true));
  }, [user, loadDevices]);

  async function leave(everywhere: boolean) {
    setBusy(everywhere ? 'all' : 'me');
    try {
      await signOut({ everywhere });
      toast({
        kind: 'success',
        title: everywhere ? 'خرجت من كل الأجهزة' : 'سجلت خروجك',
        description: 'نشوفك قريب.',
      });
    } catch (err) {
      toast({
        kind: 'error',
        title: err instanceof ApiError ? err.message : 'ما قدرناش نخرجك. جرّب تاني.',
      });
      setBusy(null);
    }
  }

  async function removeDevice(d: Device) {
    setBusy(d.id);
    try {
      await signOutDevice(d.id);
      await loadDevices();
      toast({ kind: 'success', title: `خرّجنا ${d.label}` });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'جرّب تاني.' });
    } finally {
      setBusy(null);
    }
  }

  if (!user) return <div className="page-body" aria-busy="true" />;

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'حسابي' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">حسابي</h1>
            <p className="sb-lead">
              بتدخل برقم{' '}
              <span className="sb-num" dir="ltr">
                {formatEgyptianMobile(user.phone)}
              </span>
            </p>
          </div>
          <Link
            className="sb-btn sb-btn--secondary"
            href={user.role === 'mentor' ? '/account/mentor' : '/sessions'}
          >
            <Icon name={user.role === 'mentor' ? 'user' : 'calendar'} />
            {user.role === 'mentor' ? 'ملفي كمرشد' : 'جلساتي'}
          </Link>
          {user.role === 'mentor' ? (
            <Link className="sb-btn sb-btn--secondary" href="/account/availability">
              <Icon name="calendar" />
              مواعيدي
            </Link>
          ) : null}
        </div>
      </PageHead>

      <section className="sb-container page-body acct">
        {failed ? (
          <p className="sb-small" role="alert">
            ما قدرناش نجيب بيانات حسابك. حدّث الصفحة وجرّب تاني.
          </p>
        ) : null}

        <div className="sb-card acct-card">
          <h2 className="sb-h3">بياناتك</h2>
          {profile ? (
            <ProfileForm
              key={profile.fullName ?? ''}
              profile={profile}
              submitLabel="احفظ التعديلات"
              onSaved={async (saved) => {
                setProfile(saved);
                await refresh();
                toast({ kind: 'success', title: 'اتحفظت التعديلات' });
              }}
            />
          ) : (
            <div aria-busy="true" style={{ minHeight: 200 }} />
          )}
        </div>

        <div className="sb-card acct-card">
          <h2 className="sb-h3">إشعارات الإيميل</h2>
          <p className="sb-small">
            الإشعارات بتوصلك هنا على الموقع دايمًا. ضيف إيميلك لو عايزها توصلك عليه كمان.
          </p>
          <EmailSettings />
        </div>

        <div className="sb-card acct-card">
          <h2 className="sb-h3">الأجهزة اللي داخل منها</h2>
          <p className="sb-small">لو في جهاز مش عارفه، خرّجه وغيّر الرقم لو لزم.</p>
          <ul className="acct-devices">
            {(devices ?? []).map((d) => (
              <li key={d.id}>
                <span className="i22" aria-hidden="true">
                  <Icon name="phone" />
                </span>
                <span className="g">
                  <strong>
                    {d.label}{' '}
                    {d.current ? (
                      <span className="sb-badge sb-badge--success">الجهاز ده</span>
                    ) : null}
                  </strong>
                  <span className="sb-caption">
                    آخر استخدام: {when.format(new Date(d.lastUsedAt))}
                  </span>
                </span>
                {d.current ? null : (
                  <button
                    type="button"
                    className="sb-btn sb-btn--ghost sb-btn--sm"
                    aria-busy={busy === d.id}
                    onClick={() => void removeDevice(d)}
                  >
                    خرّجه
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="sb-card acct-card acct-out">
          <div>
            <h2 className="sb-h3">تسجيل الخروج</h2>
            <p className="sb-small">جلساتك وحجوزاتك محفوظة. ادخل تاني برقمك في أي وقت.</p>
          </div>
          <div className="acct-out-actions">
            <button
              type="button"
              className="sb-btn sb-btn--secondary"
              aria-busy={busy === 'me'}
              onClick={() => void leave(false)}
            >
              تسجيل الخروج
            </button>
            <button
              type="button"
              className="sb-btn sb-btn--ghost acct-danger"
              onClick={() => setConfirmAll(true)}
            >
              اخرج من كل الأجهزة
            </button>
          </div>
        </div>
      </section>

      {confirmAll ? (
        <Modal
          title="تخرج من كل الأجهزة؟"
          onClose={() => setConfirmAll(false)}
          footer={
            <>
              <button
                type="button"
                className="sb-btn sb-btn--primary"
                aria-busy={busy === 'all'}
                onClick={() => void leave(true)}
              >
                أيوه، اخرج من الكل
              </button>
              <button
                type="button"
                className="sb-btn sb-btn--ghost"
                onClick={() => setConfirmAll(false)}
              >
                لأ، خليني
              </button>
            </>
          }
        >
          <p className="sb-body">
            هتخرج من الجهاز ده ومن أي جهاز تاني داخل بحسابك. هتحتاج كود جديد عشان تدخل.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
