'use client';

import { Icon } from '@sabeq/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  listNotifications,
  markNotificationsRead,
  timeAgo,
  unreadNotifications,
  type AppNotification,
} from '@/lib/notifications';

const POLL_MS = 60_000;
const SHOWN = 6;

/**
 * The bell in the top bar (Phase 19 — not in the design, which has no notifications UI): unread
 * count, and the latest few in a panel. Opening one marks it read and goes where it points.
 */
export function NotificationsBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [now, setNow] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // The count: on load, on every page change, and every minute.
  useEffect(() => {
    let live = true;
    const load = () =>
      unreadNotifications()
        .then((n) => live && setUnread(n))
        .catch(() => undefined);
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [pathname]);

  // The panel: fresh each time it opens; closes on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    let live = true;
    listNotifications(undefined, SHOWN)
      .then((p) => {
        if (!live) return;
        setNow(Date.now());
        setItems(p.items);
        setUnread(p.unread);
      })
      .catch(() => live && setItems([]));
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      live = false;
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function go(n: AppNotification) {
    setOpen(false);
    if (!n.read) {
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationsRead([n.id]).catch(() => undefined);
    }
    router.push(n.link);
  }

  function readAll() {
    setUnread(0);
    setItems((l) => l?.map((n) => ({ ...n, read: true })) ?? null);
    void markNotificationsRead().catch(() => undefined);
  }

  return (
    <div className="bell" ref={box}>
      <button
        type="button"
        className="sb-btn sb-btn--ghost bell-btn"
        aria-label={unread ? `الإشعارات، ${unread} جديدة` : 'الإشعارات'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          if (!open) setItems(null);
          setOpen((o) => !o);
        }}
      >
        <Icon name="bell" />
        {unread ? <span className="bell-dot sb-num">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="bell-panel sb-card" role="dialog" aria-label="الإشعارات">
          <div className="bell-head">
            <b>الإشعارات</b>
            {unread ? (
              <button type="button" className="sb-btn sb-btn--link" onClick={readAll}>
                علّم الكل مقروء
              </button>
            ) : null}
          </div>
          {items === null ? (
            <div className="bell-empty" aria-busy="true" />
          ) : items.length ? (
            <ul className="bell-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={n.read ? 'bell-item' : 'bell-item is-new'}
                    onClick={() => go(n)}
                  >
                    <b>{n.title}</b>
                    <span>{n.body}</span>
                    <span className="sb-caption">{timeAgo(n.createdAt, now)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="bell-empty sb-small">
              مفيش إشعارات لسه. هنقولك هنا لما حاجة تحصل في جلساتك.
            </p>
          )}
          <Link className="bell-all" href="/notifications" onClick={() => setOpen(false)}>
            كل الإشعارات
          </Link>
        </div>
      ) : null}
    </div>
  );
}
