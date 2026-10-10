import type { PageInfo } from '@/lib/verification';

/** Newer / older pages under a table. */
export function Pager({ page, onPage }: { page: PageInfo; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  if (pages <= 1) return null;
  return (
    <div className="adm-pager">
      <button
        type="button"
        className="sb-btn sb-btn--ghost sb-btn--sm"
        disabled={page.page <= 1}
        onClick={() => onPage(page.page - 1)}
      >
        الأحدث
      </button>
      <span className="sb-small sb-num">
        {page.page} / {pages}
      </span>
      <button
        type="button"
        className="sb-btn sb-btn--ghost sb-btn--sm"
        disabled={page.page >= pages}
        onClick={() => onPage(page.page + 1)}
      >
        الأقدم
      </button>
    </div>
  );
}
