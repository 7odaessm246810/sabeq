import { Icon } from '@sabeq/ui';

/** Design-system select (`.sb-select-wrap`), options as `[value, label]` pairs. */
export function Select({
  id,
  value,
  options,
  placeholder = 'اختار',
  onChange,
}: {
  id: string;
  value: string;
  options: readonly (readonly [string, string])[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sb-select-wrap">
      <select
        className="sb-input sb-select"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      <span>
        <Icon name="chevron" />
      </span>
    </div>
  );
}
