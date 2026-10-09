'use client';

import { Logo, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ADMIN_ROLE_LABELS, useAdmin, useAuth, type AdminUser } from '@/lib/auth';

/** Header + content frame for every signed-in admin page; signed-out visitors go to /login. */
export function AdminShell({
  children,
  title,
}: {
  children: (admin: AdminUser) => ReactNode;
  title: string;
}) {
  const admin = useAdmin();
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  if (!admin) return <main className="adm-loading" aria-busy="true" />;

  const nav = [
    {
      href: '/',
      label: 'طلبات المرشدين',
      show: admin.adminRole === 'super_admin' || admin.adminRole === 'verifier',
    },
    {
      href: '/catalog',
      label: 'الكليات',
      show: admin.adminRole === 'super_admin' || admin.adminRole === 'support',
    },
    { href: '/audit', label: 'سجل العمليات', show: admin.adminRole === 'super_admin' },
  ].filter((n) => n.show);

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-top-in">
          <Link href="/" className="adm-brand" aria-label="لوحة التحكم">
            <Logo size={26} />
            <span className="sb-badge sb-badge--neutral">لوحة التحكم</span>
          </Link>
          <nav aria-label="الأقسام" className="adm-nav">
            {nav.map((n) => {
              const active =
                n.href === '/'
                  ? pathname === '/' || pathname.startsWith('/applications')
                  : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="adm-me">
            <span className="sb-small">
              {admin.fullName ?? 'أدمن'} · {ADMIN_ROLE_LABELS[admin.adminRole]}
            </span>
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-btn--sm"
              onClick={() =>
                void signOut()
                  .then(() => router.replace('/login'))
                  .catch(() => toast({ kind: 'error', title: 'ما قدرناش نخرجك. جرّب تاني.' }))
              }
            >
              خروج
            </button>
          </div>
        </div>
      </header>
      <main className="adm-main">
        <h1 className="sb-h2 adm-title">{title}</h1>
        {children(admin)}
      </main>
    </div>
  );
}
