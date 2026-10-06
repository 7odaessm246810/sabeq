'use client';

/**
 * Demo state that the prototype kept in a global `state` object: the signed-in user, booked sessions
 * and saved mentors. Persisted in sessionStorage so a reload keeps the demo flow.
 * Phases 07 (auth), 08 (student account) and 15 (booking) replace this with the API.
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

export type SessionStatus = 'upcoming' | 'done' | 'cancelled';

export interface DemoSession {
  id: string;
  mentorId: number;
  type: string;
  day: string;
  time: string;
  price: number;
  status: SessionStatus;
  rated?: boolean;
}

export interface PendingSlot {
  mentorId: number;
  day: string;
  time: string;
}

interface DemoState {
  user: { name: string } | null;
  sessions: DemoSession[];
  saved: Record<number, boolean>;
  /** Where to go after login (prototype `state.after`). */
  after: string | null;
  /** Slot picked on a mentor profile, carried into the booking flow (prototype `state.pre`). */
  pre: PendingSlot | null;
}

const INITIAL: DemoState = {
  user: null,
  sessions: [
    {
      id: 's0',
      mentorId: 5,
      type: 'استشارة عن الكلية',
      day: 'السبت 19 سبتمبر',
      time: '6:00 م',
      price: 195,
      status: 'done',
      rated: false,
    },
  ],
  saved: {},
  after: null,
  pre: null,
};

const KEY = 'sabeq-demo-v1';

interface DemoApi extends DemoState {
  signIn: (name: string) => void;
  toggleSaved: (mentorId: number) => void;
  addSession: (s: DemoSession) => void;
  updateSession: (id: string, patch: Partial<DemoSession>) => void;
  setAfter: (path: string | null) => void;
  setPre: (pre: PendingSlot | null) => void;
  upcomingCount: number;
  /** False until sessionStorage was read — wait for it before redirecting signed-out users. */
  ready: boolean;
}

const Ctx = createContext<DemoApi | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(INITIAL);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      // Hydrate after mount so server and client render the same first frame.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setState({ ...INITIAL, ...(JSON.parse(raw) as Partial<DemoState>) });
    } catch {
      /* storage unavailable (private mode) — the demo still works in memory */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, ready]);

  const signIn = useCallback((name: string) => setState((s) => ({ ...s, user: { name } })), []);
  const toggleSaved = useCallback(
    (mentorId: number) =>
      setState((s) => ({ ...s, saved: { ...s.saved, [mentorId]: !s.saved[mentorId] } })),
    [],
  );
  const addSession = useCallback(
    (session: DemoSession) => setState((s) => ({ ...s, sessions: [session, ...s.sessions] })),
    [],
  );
  const updateSession = useCallback(
    (id: string, patch: Partial<DemoSession>) =>
      setState((s) => ({
        ...s,
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      })),
    [],
  );
  const setAfter = useCallback((after: string | null) => setState((s) => ({ ...s, after })), []);
  const setPre = useCallback((pre: PendingSlot | null) => setState((s) => ({ ...s, pre })), []);

  const value = useMemo<DemoApi>(
    () => ({
      ...state,
      signIn,
      toggleSaved,
      addSession,
      updateSession,
      setAfter,
      setPre,
      upcomingCount: state.sessions.filter((s) => s.status === 'upcoming').length,
      ready,
    }),
    [state, ready, signIn, toggleSaved, addSession, updateSession, setAfter, setPre],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo(): DemoApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDemo must be used inside <DemoStoreProvider>');
  return v;
}
