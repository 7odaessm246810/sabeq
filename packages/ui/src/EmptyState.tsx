import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  /** Why it is empty + what to do next (UX Flows: Empty = why + suggestion + action). */
  description: ReactNode;
  actions?: ReactNode;
  /** Product pages in the prototype use 56px top/bottom; the component default is 40px. */
  roomy?: boolean;
}

/** Dashed path from «you» to the amber node — the design's empty-state art. */
export function EmptyArt() {
  return (
    <svg className="sb-empty-art" viewBox="0 0 120 72" aria-hidden="true">
      <path className="p" d="M104 60 C104 34 16 46 16 16" />
      <circle className="n" cx={104} cy={60} r={6} />
      <circle className="a" cx={16} cy={14} r={7} />
    </svg>
  );
}

export function EmptyState({ title, description, actions, roomy = false }: EmptyStateProps) {
  return (
    <div className="sb-empty" style={roomy ? { padding: '56px 24px' } : undefined}>
      <EmptyArt />
      <h3>{title}</h3>
      <p>{description}</p>
      {actions ? <div className="sb-empty-actions">{actions}</div> : null}
    </div>
  );
}
