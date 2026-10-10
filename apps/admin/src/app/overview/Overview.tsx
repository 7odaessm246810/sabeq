'use client';

import { Banner } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell } from '@/components/AdminShell';
import { Money } from '@/components/Money';
import { getOverview, type Overview as Data } from '@/lib/dashboard';

/** The numbers (Phase 20): people, sessions and money this month (Cairo time). */
export function Overview() {
  return <AdminShell title="نظرة عامة">{() => <Body />}</AdminShell>;
}

function Stat({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  hint?: string;
}) {
  const inner = (
    <>
      <span className="sb-small">{label}</span>
      <b>{typeof value === 'number' ? <span className="sb-num">{value}</span> : value}</b>
      {hint ? <span className="sb-caption">{hint}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className="sb-card adm-stat">
      {inner}
    </Link>
  ) : (
    <div className="sb-card adm-stat">{inner}</div>
  );
}

function Body() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    getOverview()
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, []);

  if (error)
    return (
      <Banner kind="error" title="ما قدرناش نجيب الأرقام">
        حدّث الصفحة وجرّب تاني.
      </Banner>
    );
  if (!data) return <div aria-busy="true" style={{ minHeight: 300 }} />;

  return (
    <>
      <h2 className="sb-h3 adm-card-title">الفلوس — الشهر ده</h2>
      <div className="adm-stats">
        <Stat label="اتدفع من الطلبة" value={<Money egp={data.money.paidThisMonthEgp} />} />
        <Stat label="اترجع للطلبة" value={<Money egp={data.money.refundedThisMonthEgp} />} />
        <Stat
          label="فضل لسابق"
          value={<Money egp={data.money.keptThisMonthEgp} />}
          hint="العمولة ورسوم الخدمة من الجلسات اللي خلصت"
        />
        <Stat
          label="مستحق للمرشدين"
          value={<Money egp={data.money.owedToMentorsEgp} />}
          href="/payouts"
          hint="لسه ما اتحوّلش"
        />
      </div>
      {data.money.refundsPending ? (
        <Banner kind="warning" title={`${data.money.refundsPending} استرداد مستني`}>
          بوابة الدفع ما ردتش لسه؛ النظام بيحاول تاني لوحده كل دقيقتين.
        </Banner>
      ) : null}

      <h2 className="sb-h3 adm-card-title">الجلسات</h2>
      <div className="adm-stats">
        <Stat label="النهارده" value={data.sessions.today} href="/bookings" />
        <Stat label="جاية" value={data.sessions.upcoming} href="/bookings?status=confirmed" />
        <Stat label="اتحجزت الشهر ده" value={data.sessions.bookedThisMonth} />
        <Stat label="خلصت الشهر ده" value={data.sessions.completedThisMonth} />
      </div>

      <h2 className="sb-h3 adm-card-title">الناس</h2>
      <div className="adm-stats">
        <Stat label="طلبة" value={data.people.students} href="/users?role=student" />
        <Stat label="مرشدين ظاهرين" value={data.people.mentorsListed} href="/users?role=mentor" />
        <Stat label="طلبات مرشدين مستنية" value={data.people.applicationsWaiting} href="/" />
        <Stat label="تقييمات مخفية" value={data.reviewsHidden} href="/reviews?status=hidden" />
      </div>
    </>
  );
}
