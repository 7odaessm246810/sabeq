import { EmptyState, Logo } from '@sabeq/ui';

/** Phase 02 placeholder — admin login and verification arrive in Phases 07 and 10, the dashboard in 20. */
export default function AdminHome() {
  return (
    <main className="admin-shell">
      <div className="sb-card admin-card">
        <div className="admin-brand">
          <Logo size={28} />
          <span className="sb-badge sb-badge--neutral">لوحة التحكم</span>
        </div>
        <EmptyState
          title="لوحة التحكم لسه بتتبني"
          description="تسجيل دخول الأدمن ومراجعة طلبات المرشدين هيبدأوا في المراحل الجاية."
        />
      </div>
    </main>
  );
}
