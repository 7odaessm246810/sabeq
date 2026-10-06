'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Icon } from './Icon';
import { cx } from './identity';

/* ---------------- tabs ---------------- */

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
}

/**
 * Underlined tabs with a moving ink bar (Motion → Morph). Arrow keys move between tabs;
 * in RTL, ArrowLeft is "next".
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${value}"]`);
      if (btn) setInk({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value]);

  function onKeyDown(e: KeyboardEvent) {
    const i = items.findIndex((t) => t.key === value);
    const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = items[(i + step + items.length) % items.length];
    if (!next) return;
    onChange(next.key);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-key="${next.key}"]`)?.focus();
  }

  return (
    <div className="sb-tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          className="sb-tab"
          role="tab"
          data-key={t.key}
          aria-selected={t.key === value}
          tabIndex={t.key === value ? 0 : -1}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
      {ink ? <span className="sb-tab-ink" style={{ left: ink.left, width: ink.width }} /> : null}
    </div>
  );
}

/* ---------------- segmented ---------------- */

export function Segmented<K extends string | number>({
  options,
  value,
  onChange,
  label,
  id,
  block = false,
}: {
  options: readonly (readonly [K, ReactNode])[];
  value: K;
  onChange: (key: K) => void;
  label?: string;
  id?: string;
  block?: boolean;
}) {
  return (
    <div
      className="sb-seg"
      id={id}
      role="group"
      aria-label={label}
      style={
        block
          ? { width: '100%', display: 'grid', gridTemplateColumns: `repeat(${options.length},1fr)` }
          : undefined
      }
    >
      {options.map(([key, text]) => (
        <button
          key={String(key)}
          type="button"
          aria-pressed={key === value}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/* ---------------- stepper ---------------- */

/** Booking / application progress. Done steps show a check; the current one is marked `aria-current="step"`. */
export function Stepper({
  steps,
  current,
  id,
}: {
  steps: readonly string[];
  current: number;
  id?: string;
}) {
  return (
    <ol className="sb-steps" id={id}>
      {steps.map((label, i) => (
        <li
          key={label}
          className={cx('sb-step', i < current && 'is-done', i === current && 'is-current')}
          aria-current={i === current ? 'step' : undefined}
        >
          <span className="sb-step-dot">{i < current ? <Icon name="check" /> : `0${i + 1}`}</span>
          <span className="sb-step-label">{label}</span>
          {i < steps.length - 1 ? <span className="sb-step-line" /> : null}
        </li>
      ))}
    </ol>
  );
}
