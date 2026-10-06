'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from './Icon';
import type { IconName } from './icon-paths';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastInput {
  kind: ToastKind;
  title: string;
  /** What happened / what to do next. For errors: was money affected + how to fix (README §8). */
  description?: string;
}

interface ToastItem extends ToastInput {
  id: number;
  leaving: boolean;
}

const ICONS: Record<ToastKind, IconName> = { success: 'check', error: 'alert', info: 'info' };
const VISIBLE_MS = 4500;
const LEAVE_MS = 250;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setItems((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      later(() => setItems((list) => list.filter((t) => t.id !== id)), LEAVE_MS);
    },
    [later],
  );

  const show = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setItems((list) => [...list, { ...toast, id, leaving: false }]);
      later(() => dismiss(id), VISIBLE_MS);
    },
    [dismiss, later],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {items.length > 0 ? (
        <div className="toast-stack">
          {items.map((t) => (
            <div key={t.id} className="toast-host" style={t.leaving ? { opacity: 0 } : undefined}>
              <div
                className={`sb-toast sb-toast--${t.kind}`}
                role={t.kind === 'error' ? 'alert' : 'status'}
              >
                <span className="sb-toast-ico">
                  <Icon name={ICONS[t.kind]} />
                </span>
                <span className="sb-toast-body">
                  <b>{t.title}</b>
                  {t.description ? <span>{t.description}</span> : null}
                </span>
                <button
                  type="button"
                  className="sb-toast-x"
                  aria-label="إغلاق"
                  onClick={() => dismiss(t.id)}
                >
                  <Icon name="x" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

/** `const toast = useToast(); toast({ kind: 'success', title: 'اشتركت' })` */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');
  return show;
}
