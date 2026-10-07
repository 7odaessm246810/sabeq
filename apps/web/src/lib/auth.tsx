'use client';

/**
 * Who is signed in, from the API session cookie (Phase 07). The cookie is httpOnly, so the page
 * never sees the token — it asks `/auth/me` once on load and updates after login / logout.
 */
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

export interface AuthUser {
  id: string;
  role: 'student' | 'mentor' | 'admin';
  fullName: string | null;
  phone: string;
  needsProfile: boolean;
}

export type SignupRole = 'student' | 'mentor';

export interface OtpRequest {
  expiresInSeconds: number;
  resendAfterSeconds: number;
  /** Local development only — the API returns the code so it can be shown on the page. */
  devCode?: string;
}

interface AuthApi {
  /** `loading` until the first `/auth/me` answer. */
  status: 'loading' | 'signed-in' | 'signed-out';
  user: AuthUser | null;
  requestCode(phone: string): Promise<OtpRequest>;
  verifyCode(
    phone: string,
    code: string,
    role: SignupRole,
  ): Promise<{ user: AuthUser; isNew: boolean }>;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthApi['status']>('loading');

  useEffect(() => {
    const ctrl = new AbortController();
    api<{ user: AuthUser }>('/auth/me', { signal: ctrl.signal })
      .then((d) => {
        setUser(d.user);
        setStatus('signed-in');
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        // 401 is the normal signed-out answer. If the API is unreachable the visitor browses
        // signed out too; login shows the real error when they try.
        setStatus('signed-out');
      });
    return () => ctrl.abort();
  }, []);

  const requestCode = useCallback(
    (phone: string) => api<OtpRequest>('/auth/otp/request', { method: 'POST', body: { phone } }),
    [],
  );

  const verifyCode = useCallback(async (phone: string, code: string, role: SignupRole) => {
    const d = await api<{ user: AuthUser; isNew: boolean }>('/auth/otp/verify', {
      method: 'POST',
      body: { phone, code, role },
    });
    setUser(d.user);
    setStatus('signed-in');
    return d;
  }, []);

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setStatus('signed-out');
  }, []);

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
