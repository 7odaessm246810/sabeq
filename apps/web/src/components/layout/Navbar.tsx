'use client';

import { Avatar, Icon, Logo } from '@sabeq/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useDemo } from '@/lib/demo-store';
import { MAIN_NAV, isCurrent } from '@/lib/site';
import { MobileMenu } from './MobileMenu';

const SCROLL_THRESHOLD = 24;

/**
 * Fixed top bar. On the home page it starts transparent over the hero and turns solid after 24px of scroll;
 * on every other page it is always solid (prototype `body:not([data-route="home"]) #nav`).
 */
export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, upcomingCount } = useDemo();
  // Stable reference: MobileMenu re-runs its focus/scroll-lock effect when onClose changes.
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const classes = ['sb-nav', 'site-nav'];
  if (scrolled) classes.push('is-scrolled');
  if (pathname !== '/') classes.push('is-solid');

  return (
    <>
      <nav className={classes.join(' ')} aria-label="التنقل الرئيسي">
        <div className="sb-nav-in">
          <Link href="/" aria-label="سابق — الرئيسية">
            <Logo size={32} />
          </Link>
          <ul className="sb-nav-links">
            {MAIN_NAV.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isCurrent(link, pathname) ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="sb-nav-end">
            {user ? (
              <>
                <Link className="sb-btn sb-btn--ghost sb-hide-m" href="/sessions">
                  <Icon name="calendar" />
                  جلساتي
                  {upcomingCount ? (
                    <span className="sb-badge sb-badge--primary">{upcomingCount}</span>
                  ) : null}
                </Link>
                <Link href="/sessions" className="nav-me" aria-label="حسابي">
                  <Avatar name={user.name || 'حسابي'} size="sm" tone={2} />
                </Link>
              </>
            ) : (
              <>
                <Link className="sb-btn sb-btn--ghost sb-hide-m" href="/login">
                  تسجيل الدخول
                </Link>
                <Link className="sb-btn sb-btn--primary" href="/explore">
                  ابدأ الآن
                </Link>
              </>
            )}
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-nav-burger"
              aria-label="القائمة"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
          </div>
        </div>
      </nav>
      {menuOpen ? <MobileMenu signedIn={Boolean(user)} onClose={closeMenu} /> : null}
    </>
  );
}
