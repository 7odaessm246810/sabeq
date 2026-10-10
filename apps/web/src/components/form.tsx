import { FieldError, Icon, cx } from '@sabeq/ui';
import type { ReactNode } from 'react';

/** Label + control + inline error, wired for screen readers (design-system `.sb-field`). */
export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cx('sb-field', error && 'sb-field--error')}>
      <label className="sb-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <FieldError id={`${id}-err`}>{error}</FieldError>
      ) : hint ? (
        <span className="sb-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** Options are plain strings (value = label) or `[value, label]` pairs. */
export type SelectOption = string | readonly [value: string, label: string];

export function Select({
  id,
  value,
  options,
  error,
  placeholder = 'اختار',
  onChange,
}: {
  id: string;
  value: string;
  options: readonly SelectOption[];
  error: string | undefined;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sb-select-wrap">
      <select
        className="sb-input sb-select"
        id={id}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const [v, label] = typeof o === 'string' ? [o, o] : o;
          return (
            <option key={v} value={v}>
              {label}
            </option>
          );
        })}
      </select>
      <span>
        <Icon name="chevron" />
      </span>
    </div>
  );
}
