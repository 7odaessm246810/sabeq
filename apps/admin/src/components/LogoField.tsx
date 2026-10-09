'use client';

import { LOGO_MAX_BYTES, LOGO_TYPES } from '@sabeq/types';
import { OrgLogo, useToast } from '@sabeq/ui';
import { useId, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { removeLogo, uploadLogo } from '@/lib/catalog';

/**
 * Upload / replace / remove the logo of a university or faculty. The file goes straight to the API
 * (PNG, JPG or WebP up to 512 KB); the API checks the bytes again.
 */
export function LogoField({
  owner,
  id,
  name,
  logo,
  fallback,
  onChange,
}: {
  owner: 'universities' | 'faculties';
  id: string;
  name: string;
  logo: string | null;
  /** Shown when this row has no logo of its own (a faculty shows its university's). */
  fallback?: { logo: string | null; note: string } | undefined;
  onChange: (logo: string | null) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const shown = logo ?? fallback?.logo ?? null;

  async function pick(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) {
      toast({ kind: 'error', title: 'اللوجو لازم يكون PNG أو JPG أو WebP.' });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast({ kind: 'error', title: 'اللوجو لازم يكون أقل من 512 كيلوبايت.' });
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadLogo(owner, id, file));
      toast({ kind: 'success', title: 'اللوجو اتحفظ' });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'جرّب تاني.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await removeLogo(owner, id);
      onChange(null);
      toast({ kind: 'success', title: 'اللوجو اتشال' });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'جرّب تاني.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-logo">
      <OrgLogo src={shown} name={name} size={72} />
      <div className="adm-logo-side">
        <span className="sb-small" id={hintId}>
          {logo ? 'اللوجو الحالي.' : fallback?.logo ? fallback.note : 'مفيش لوجو لسه.'} PNG أو JPG
          أو WebP، أقل من 512 كيلوبايت، ويفضل مربع بخلفية شفافة.
        </span>
        <div className="adm-row-actions">
          <input
            ref={input}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="adm-sr"
            aria-describedby={hintId}
            tabIndex={-1}
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <button
            type="button"
            className="sb-btn sb-btn--secondary sb-btn--sm"
            aria-busy={busy}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {logo ? 'غيّر اللوجو' : 'ارفع لوجو'}
          </button>
          {logo ? (
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-btn--sm adm-danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              شيل اللوجو
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
