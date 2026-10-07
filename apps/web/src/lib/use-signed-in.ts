'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { useAuth, type AuthUser } from './auth';
import { useDemo } from './demo-store';

/**
 * Personal pages: signed-out visitors go to login and come back to `returnTo` after (UX Flows).
 * Returns the user once known; null while loading or redirecting.
 */
export function useSignedIn(returnTo: string): AuthUser | null {
  const { status, user, signedOutByUser } = useAuth();
  const { setAfter } = useDemo();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signed-out' && !signedOutByUser) {
      setAfter(returnTo);
      router.replace('/login');
    }
  }, [status, signedOutByUser, returnTo, setAfter, router]);

  return status === 'signed-in' ? user : null;
}

/** Sign out (this device or everywhere), forget the demo user and go home. */
export function useSignOut() {
  const { signOut } = useAuth();
  const { forgetUser } = useDemo();
  const router = useRouter();
  return useCallback(
    async (opts?: { everywhere?: boolean }) => {
      await signOut(opts);
      forgetUser();
      router.replace('/');
    },
    [signOut, forgetUser, router],
  );
}
