'use client';

import { Icon, Logo, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { MOBILE_NAV } from '@/lib/site';
import { useSignOut } from '@/lib/use-signed-in';

const ACCOUNT_NAV = [
  { href: '/sessions', label: 'جلساتي' },
  { href: '/notifications', label: 'الإشعارات' },
  { href: '/account', label: 'حسابي' },
] as const;

/** Side sheet from the prototype `openMenu()`: scrim, links with chevrons, actions pinned to the bottom. */
export function MobileMenu({ onClose, signedIn }: { onClose: () => void; signedIn: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const signOutAndLeave = useSignOut();
  const toast = useToast();

  async function signOut() {
    onClose();
    try {
      await signOutAndLeave();
      toast({ kind: 'success', title: 'سجلت خروجك', description: 'نشوفك قريب.' });
    } catch {
      toast({ kind: 'error', title: 'ما قدرناش نخرجك. جرّب تاني.' });
    }
  }

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="mmenu"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="mmenu-in"
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="القائمة"
      >
        <div className="mmenu-h">
          <Logo size={28} latin={false} />
          <button
            ref={closeRef}
            type="button"
            className="sb-btn sb-btn--ghost"
            aria-label="إغلاق"
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </div>
        <nav aria-label="القائمة">
          {[...(signedIn ? ACCOUNT_NAV : []), ...MOBILE_NAV].map((link) => (
            <Link key={link.href} href={link.href} onClick={onClose}>
              {link.label}
              <span>
                <Icon name="chevL" />
              </span>
            </Link>
          ))}
        </nav>
        <div className="mmenu-f">
          {signedIn ? (
            <button
              type="button"
              className="sb-btn sb-btn--secondary sb-btn--lg sb-btn--block"
              onClick={() => void signOut()}
            >
              تسجيل الخروج
            </button>
          ) : (
            <Link
              className="sb-btn sb-btn--secondary sb-btn--lg sb-btn--block"
              href="/login"
              onClick={onClose}
            >
              تسجيل الدخول
            </Link>
          )}
          <Link
            className="sb-btn sb-btn--primary sb-btn--lg sb-btn--block"
            href="/explore"
            onClick={onClose}
          >
            استكشف الكليات
          </Link>
        </div>
      </div>
    </div>
  );
}
