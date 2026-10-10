'use client';

import { EmptyState } from '@sabeq/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/PageHead';
import {
  listNotifications,
  markNotificationsRead,
  timeAgo,
  type AppNotification,
} from '@/lib/notifications';
import { useSignedIn } from '@/lib/use-signed-in';

/** All of the signed-in person's notifications (Phase 19), newest first, 20 at a time. */
export function NotificationsClient() {
  const user = useSignedIn('/notifications');
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(0);

  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    listNotifications()
      .then((p) => {
        if (!live) return;
        setNow(Date.now());
        setItems(p.items);
        setNext(p.nextBefore);
        setUnread(p.unread);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [signedIn]);

  if (!user) return <div className="page-body" aria-busy="true" />;

  function more() {
    if (!next) return;
    setLoading(true);
    listNotifications(next)
      .then((p) => {
        setItems((l) => [...(l ?? []), ...p.items]);
        setNext(p.nextBefore);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }

  function open(n: AppNotification) {
    if (!n.read) void markNotificationsRead([n.id]).catch(() => undefined);
    router.push(n.link);
  }

  function readAll() {
    setUnread(0);
    setItems((l) => l?.map((n) => ({ ...n, read: true })) ?? null);
    void markNotificationsRead().catch(() => undefined);
  }

  return (
    <>
      <PageHead crumbs={[{ label: 'الرئيسية', href: '/' }, { label: 'الإشعارات' }]}>
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">الإشعارات</h1>
            <p className="sb-lead">
              {unread ? `عندك ${unread} إشعار جديد.` : 'كل اللي حصل في جلساتك.'}
            </p>
          </div>
          {unread ? (
            <button type="button" className="sb-btn sb-btn--secondary" onClick={readAll}>
              علّم الكل مقروء
            </button>
          ) : null}
        </div>
      </PageHead>
      <section className="sb-container page-body" style={{ maxWidth: 760 }}>
        {failed ? (
          <div className="sb-card" role="alert">
            <EmptyState title="ما قدرناش نجيب الإشعارات" description="حدّث الصفحة وجرّب تاني." />
          </div>
        ) : !items ? (
          <div className="sb-card" style={{ minHeight: 200 }} aria-busy="true" />
        ) : items.length ? (
          <div className="sb-card" style={{ padding: 0, overflow: 'hidden' }}>
            <ul className="bell-list" style={{ maxHeight: 'none' }}>
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.read ? 'bell-item' : 'bell-item is-new'}
                    onClick={() => open(n)}
                  >
                    <b>{n.title}</b>
                    <span>{n.body}</span>
                    <span className="sb-caption">{timeAgo(n.createdAt, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {next ? (
              <button
                type="button"
                className="bell-all sb-btn sb-btn--ghost"
                style={{ width: '100%' }}
                disabled={loading}
                aria-busy={loading}
                onClick={more}
              >
                اعرض أقدم
              </button>
            ) : null}
          </div>
        ) : (
          <div className="sb-card">
            <EmptyState
              roomy
              title="مفيش إشعارات لسه"
              description="هنقولك هنا لما حاجة تحصل في جلساتك: حجز جديد، تذكير قبل الجلسة، أو تقييم."
              actions={
                <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/sessions">
                  جلساتي
                </Link>
              }
            />
          </div>
        )}
      </section>
    </>
  );
}
