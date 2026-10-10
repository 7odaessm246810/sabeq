'use client';

import { EmptyState, MentorCardSkeleton } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MentorCard } from '@/components/cards';
import { useAuth } from '@/lib/auth';
import { listSaved, toMentorView, type MentorCardData } from '@/lib/mentors';

/** «المحفوظين»: the mentors a student saved from their profiles (Phase 12, `/me/saved-mentors`). */
export function SavedMentors() {
  const { status, user } = useAuth();
  const isStudent = status === 'signed-in' && user?.role === 'student';
  const [list, setList] = useState<MentorCardData[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isStudent) return;
    let live = true;
    listSaved()
      .then((l) => live && setList(l))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [isStudent]);

  if (status === 'signed-in' && !isStudent) {
    return (
      <div className="sb-card">
        <EmptyState roomy title="الحفظ للطلبة بس" description="حساب المرشد مالوش قائمة محفوظين." />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="sb-card" role="alert">
        <EmptyState title="ما قدرناش نجيب المحفوظين" description="حدّث الصفحة وجرّب تاني." />
      </div>
    );
  }
  if (!list) {
    return (
      <div className="mgrid-site" aria-busy="true">
        <MentorCardSkeleton />
        <MentorCardSkeleton />
      </div>
    );
  }
  return list.length ? (
    <div className="mgrid-site">
      {list.map((m) => (
        <MentorCard key={m.slug} mentor={toMentorView(m)} />
      ))}
    </div>
  ) : (
    <div className="sb-card">
      <EmptyState
        roomy
        title="مفيش مرشدين محفوظين"
        description="اضغط «احفظ» في ملف أي مرشد عشان ترجعله بسهولة."
        actions={
          <Link className="sb-btn sb-btn--primary sb-btn--sm" href="/mentors">
            استكشف المرشدين
          </Link>
        }
      />
    </div>
  );
}
