'use client';

/**
 * The signed-in admin, from the admin session cookie (`/api/v1/admin/auth`, Phase 07). Admin
 * sessions last 12 hours; when one expires the next API call answers 401 and the shell sends the
 * person back to /login.
 */
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';

export type AdminRole = 'super_admin' | 'verifier' | 'support' | 'finance';

export interface AdminUser {
  id: string;
  role: 'admin';
  adminRole: AdminRole;
  fullName: string | null;
  phone: string;
}

interface AuthApi {
  status: 'loading' | 'signed-in' | 'signed-out';
  user: AdminUser | null;
  requestCode(phone: string): Promise<{ resendAfterSeconds: number; devCode?: string }>;
  verifyCode(phone: string, code: string): Promise<AdminUser>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

async function fetchMe(signal?: AbortSignal): Promise<AdminUser | null> {
  try {
    return (await api<{ user: AdminUser }>('/admin/auth/me', signal ? { signal } : {})).user;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AuthApi['status']>('loading');

  const apply = useCallback((me: AdminUser | null) => {
    setUser(me);
    setStatus(me ? 'signed-in' : 'signed-out');
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMe(ctrl.signal)
      .then(apply)
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [apply]);

  const requestCode = useCallback(
    (phone: string) =>
      api<{ resendAfterSeconds: number; devCode?: string }>('/admin/auth/otp/request', {
        method: 'POST',
        body: { phone },
      }),
    [],
  );

  const verifyCode = useCallback(
    async (phone: string, code: string) => {
      const d = await api<{ user: AdminUser }>('/admin/auth/otp/verify', {
        method: 'POST',
        body: { phone, code },
      });
      apply(d.user);
      return d.user;
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    await api('/admin/auth/logout', { method: 'POST' });
    apply(null);
  }, [apply]);

  const value = useMemo(
    () => ({ status, user, requestCode, verifyCode, signOut }),
    [status, user, requestCode, verifyCode, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Pages behind login: returns the admin once known and sends signed-out visitors to /login. */
export function useAdmin(): AdminUser | null {
  const { status, user } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (status === 'signed-out') router.replace('/login');
  }, [status, router]);
  return status === 'signed-in' ? user : null;
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'مدير',
  verifier: 'مراجع',
  support: 'دعم',
  finance: 'مالية',
};
