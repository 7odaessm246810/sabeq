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
  /** True after the person signed out themselves — the caller navigates, guards stay quiet. */
  signedOutByUser: boolean;
  user: AuthUser | null;
  requestCode(phone: string): Promise<OtpRequest>;
  verifyCode(
    phone: string,
    code: string,
    role: SignupRole,
  ): Promise<{ user: AuthUser; isNew: boolean }>;
  /** Re-reads the user after a profile change (name in the navbar, `needsProfile`). */
  refresh(): Promise<void>;
  /** `everywhere` also signs out every other device. */
  signOut(opts?: { everywhere?: boolean }): Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

/**
 * The current user, or null when signed out. 401 is the normal signed-out answer; if the API is
 * unreachable the visitor browses signed out too and login shows the real error. Rejects only
 * when aborted.
 */
async function fetchMe(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    return (await api<{ user: AuthUser }>('/auth/me', signal ? { signal } : {})).user;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthApi['status']>('loading');
  const [signedOutByUser, setSignedOutByUser] = useState(false);

  const apply = useCallback((me: AuthUser | null) => {
    setUser(me);
    setStatus(me ? 'signed-in' : 'signed-out');
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMe(ctrl.signal)
      .then(apply)
      .catch(() => undefined); // aborted on unmount
    return () => ctrl.abort();
  }, [apply]);

  const refresh = useCallback(() => fetchMe().then(apply), [apply]);

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
    setSignedOutByUser(false);
    return d;
  }, []);

  const signOut = useCallback(async (opts?: { everywhere?: boolean }) => {
    await api(opts?.everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
    setSignedOutByUser(true);
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo(
    () => ({ status, signedOutByUser, user, requestCode, verifyCode, refresh, signOut }),
    [status, signedOutByUser, user, requestCode, verifyCode, refresh, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
