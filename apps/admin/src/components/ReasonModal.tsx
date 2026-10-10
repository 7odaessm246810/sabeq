'use client';

import { Modal } from '@sabeq/ui';
import { useState } from 'react';
import { ApiError } from '@/lib/api';

/** Confirms an admin action with a reason (it goes to the audit log). */
export function ReasonModal({
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? (err.fields.note ?? err.message) : 'حصلت مشكلة. جرّب تاني.',
      );
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className={danger ? 'sb-btn adm-btn-danger' : 'sb-btn sb-btn--primary'}
            disabled={busy || reason.trim().length < 3}
            aria-busy={busy}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </button>
          <button type="button" className="sb-btn sb-btn--ghost" onClick={onClose}>
            إلغاء
          </button>
        </>
      }
    >
      <div className="adm-modal-body">
        <p className="sb-small">{description}</p>
        <textarea
          className="sb-input"
          style={{ height: 80, padding: '12px 14px' }}
          maxLength={500}
          aria-label="السبب"
          placeholder="السبب (بيتسجل في سجل العمليات)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error ? (
          <p className="sb-small" role="alert" style={{ color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
