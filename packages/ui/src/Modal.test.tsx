import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

afterEach(cleanup);

/** Like the app's dialogs: state lives in the parent, `onClose` is a new function on every render. */
function ReasonDialog({ onClosed }: { onClosed: () => void }) {
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState('');
  return (
    <>
      <button type="button">فتح</button>
      {open ? (
        <Modal
          title="إلغاء الجلسة؟"
          onClose={() => {
            setOpen(false);
            onClosed();
          }}
          footer={<button type="button">إلغاء الجلسة</button>}
        >
          <textarea aria-label="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Modal>
      ) : null}
    </>
  );
}

describe('Modal', () => {
  it('keeps focus in the field while the user types (regression, Phase 20)', () => {
    render(<ReasonDialog onClosed={() => undefined} />);
    const field = screen.getByLabelText('السبب');
    act(() => field.focus());
    for (const value of ['ظ', 'ظر', 'ظرف']) fireEvent.change(field, { target: { value } }); // each keystroke re-renders the parent
    expect(document.activeElement).toBe(field);
    expect(field).toHaveProperty('value', 'ظرف');
  });

  it('opens with focus inside, as a labelled modal dialog', () => {
    render(<ReasonDialog onClosed={() => undefined} />);
    const dialog = screen.getByRole('dialog', { name: 'إلغاء الجلسة؟' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Escape closes it with the latest onClose, and the page scrolls again', () => {
    const onClosed = vi.fn();
    render(<ReasonDialog onClosed={onClosed} />);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.change(screen.getByLabelText('السبب'), { target: { value: 'x' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('Tab wraps around inside the dialog', () => {
    render(<ReasonDialog onClosed={() => undefined} />);
    const close = screen.getByRole('button', { name: 'إغلاق' });
    const last = screen.getByRole('button', { name: 'إلغاء الجلسة' });
    act(() => last.focus());
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
