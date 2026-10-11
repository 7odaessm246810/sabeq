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
  /** The login (ADR-0017). */
  email: string | null;
  /** Booking waits for this; Google accounts are confirmed from the start. */
  emailVerified: boolean;
  phone: string | null;
  /** False for accounts that only sign in with Google (they can add one from «حسابي»). */
  hasPassword: boolean;
  needsProfile: boolean;
}

export type SignupRole = 'student' | 'mentor';

export interface Registration {
  fullName: string;
  email: string;
  password: string;
  role: SignupRole;
}

interface AuthApi {
  /** `loading` until the first `/auth/me` answer. */
  status: 'loading' | 'signed-in' | 'signed-out';
  /** True after the person signed out themselves — the caller navigates, guards stay quiet. */
  signedOutByUser: boolean;
  user: AuthUser | null;
  /** Local development only: `devLink` is the confirmation link (no email leaves the machine). */
  register(input: Registration): Promise<{ user: AuthUser; devLink?: string }>;
  login(email: string, password: string): Promise<AuthUser>;
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

  const signedIn = useCallback((me: AuthUser) => {
    setUser(me);
    setStatus('signed-in');
    setSignedOutByUser(false);
  }, []);

  const register = useCallback(
    async (input: Registration) => {
      const d = await api<{ user: AuthUser; devLink?: string }>('/auth/register', {
        method: 'POST',
        body: input,
      });
      signedIn(d.user);
      return d;
    },
    [signedIn],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const d = await api<{ user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      signedIn(d.user);
      return d.user;
    },
    [signedIn],
  );

  const signOut = useCallback(async (opts?: { everywhere?: boolean }) => {
    await api(opts?.everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
    setSignedOutByUser(true);
    setUser(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo(
    () => ({ status, signedOutByUser, user, register, login, refresh, signOut }),
    [status, signedOutByUser, user, register, login, refresh, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Starts "Sign in with Google": a full-page trip through the API (it sets the state cookie). */
export const googleSignInUrl = (role: SignupRole) => `/api/v1/auth/google?role=${role}`;

/**
 * `google`: the Google button is configured. `emailLinks`: emails really go out — confirmation
 * and forgot-password exist (off until Resend has a domain).
 */
export interface Providers {
  google: boolean;
  emailLinks: boolean;
}
export const getProviders = () => api<Providers>('/auth/providers');

export const forgotPassword = (email: string) =>
  api<{ sent: true; devLink?: string }>('/auth/password/forgot', {
    method: 'POST',
    body: { email },
  });

export const resetPassword = (token: string, password: string) =>
  api<{ role: AuthUser['role'] }>('/auth/password/reset', {
    method: 'POST',
    body: { token, password },
  });

export const changePassword = (password: string, current?: string) =>
  api<{ changed: true }>('/auth/password/change', {
    method: 'POST',
    body: { password, ...(current ? { current } : {}) },
  });
