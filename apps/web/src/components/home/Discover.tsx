'use client';

import { EmptyState, Icon } from '@sabeq/ui';
import Link from 'next/link';
import { MentorCard } from '@/components/cards';
import { useHomeMentors } from './HomeMentors';

/** A few real, verified mentors and the way to all of them (filters live on /mentors). */
export function MentorsSection() {
  const { mentors, total } = useHomeMentors();

  return (
    <section className="sb-section sb-section--subtle">
      <div className="sb-container">
        <div className="home-mentors-head">
          <h2 className="sb-h2">مستشارين موثقين</h2>
          {total ? (
            <span className="sb-caption">
              <span className="sb-num">{total.toLocaleString('en-US')}</span> مستشار أكاديمي
            </span>
          ) : null}
        </div>
        <div className="mgrid home-mgrid">
          {mentors.length ? (
            mentors.map((m) => <MentorCard key={m.id} mentor={m} />)
          ) : (
            <div className="sb-card" style={{ gridColumn: '1/-1' }}>
              <EmptyState
                title="أول المستشارين في الطريق"
                description="كل مستشار بيتراجع بمستنداته قبل ما يظهر هنا. لو درست كلية، انضم وساعد اللي جايين."
                actions={
                  <Link href="/become-mentor" className="sb-btn sb-btn--primary sb-btn--sm">
                    انضم كمستشار
                  </Link>
                }
              />
            </div>
          )}
        </div>
        {mentors.length ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
            <Link href="/mentors" className="sb-btn sb-btn--primary">
              شوف كل المستشارين{' '}
              <span className="sb-arrow" style={{ display: 'inline-flex' }}>
                <Icon name="arrow" />
              </span>
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
