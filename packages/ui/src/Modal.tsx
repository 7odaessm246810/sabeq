'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { cx } from './identity';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** Buttons for the footer row. */
  footer?: ReactNode;
  /** Bottom sheet on mobile (filters). */
  sheet?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Dialog from the design system (`sb-modal`). Traps focus, closes on Escape / scrim click,
 * and returns focus to the element that opened it (Accessibility → Keyboard).
 */
export function Modal({ title, onClose, children, footer, sheet = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className={cx('sb-scrim modal-host', sheet && 'as-sheet')}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={cx('sb-modal', sheet && 'sb-sheet')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {sheet ? <div className="sb-sheet-grip" /> : null}
        <div className="sb-modal-head">
          <h3 className="sb-h3" id={titleId}>
            {title}
          </h3>
          <button type="button" className="sb-toast-x" aria-label="إغلاق" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className={cx('sb-modal-body', sheet && 'sheet-f')}>{children}</div>
        {footer ? <div className="sb-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
