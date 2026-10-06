import type { ReactNode } from 'react';

/**
 * Every page except home sits below the fixed navbar and fades in on navigation
 * (prototype `#app` padding + `.page-in`). A template re-mounts per navigation, a layout would not.
 */
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="page-pad page-in">{children}</div>;
}
