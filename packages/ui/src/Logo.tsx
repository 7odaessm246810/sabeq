const MARK_PATH = 'M34 39 C34 27 14 29 14 16';

export interface LogoProps {
  /** Mark size in px. The Arabic word scales to 75% of it. */
  size?: number;
  /** Reversed version for the `night` grounds (footer, final CTA). */
  night?: boolean;
  /** Hide the small Latin "SABEQ". */
  latin?: boolean;
  markOnly?: boolean;
}

/** The path that ends in an amber node — «الشخص اللي سبقك». Classes come from sabeq.css (.sb-logo). */
export function Logo({ size = 32, night = false, latin = true, markOnly = false }: LogoProps) {
  return (
    <span
      className={night ? 'sb-logo sb-logo--night' : 'sb-logo'}
      role="img"
      aria-label="سابق — SABEQ"
    >
      <LogoMark size={size} />
      {markOnly ? null : (
        <span className="sb-logo-word">
          <span className="sb-logo-ar" style={{ fontSize: Math.round(size * 0.75) }}>
            سابق
          </span>
          {latin ? <span className="sb-logo-en">SABEQ</span> : null}
        </span>
      )}
    </span>
  );
}

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path className="p" d={MARK_PATH} fill="none" strokeWidth={5} strokeLinecap="round" />
      <circle className="t" cx={34} cy={39} r={3} strokeWidth={2.5} />
      <circle className="n" cx={14} cy={10} r={5.5} />
    </svg>
  );
}
