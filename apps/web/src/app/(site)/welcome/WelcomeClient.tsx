'use client';

import { useToast } from '@sabeq/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ProfileForm } from '@/components/account/ProfileForm';
import { getProfile, type Profile } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { useDemo } from '@/lib/demo-store';
import { useSignedIn } from '@/lib/use-signed-in';

/** First login: a name (and, for students, track and year) before anything else. */
export function WelcomeClient() {
  const user = useSignedIn('/welcome');
  const { refresh } = useAuth();
  const demo = useDemo();
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    getProfile()
      .then(setProfile)
      .catch(() => setFailed(true));
  }, [user]);

  const next = () => demo.after ?? (user?.role === 'mentor' ? '/become-mentor/apply' : '/explore');

  if (!user) return <div className="page-body" aria-busy="true" />;

  return (
    <section className="sb-container page-body" style={{ maxWidth: 720, paddingTop: 28 }}>
      <h1 className="sb-h2" style={{ margin: '12px 0 6px' }}>
        أهلًا بيك في سابق
      </h1>
      <p className="sb-lead">
        {user.role === 'mentor'
          ? 'قبل ما تكمّل طلب الانضمام، عرّفنا باسمك.'
          : 'عرّفنا بيك في دقيقة، عشان نرشحلك المرشدين والكليات المناسبة.'}
      </p>
      <div className="sb-card ap-panel" style={{ minHeight: 0 }}>
        {failed ? (
          <p className="sb-small" role="alert">
            ما قدرناش نجيب بياناتك. حدّث الصفحة وجرّب تاني.
          </p>
        ) : profile ? (
          <ProfileForm
            profile={profile}
            submitLabel="يلا نبدأ"
            onSaved={async (saved) => {
              await refresh();
              toast({
                kind: 'success',
                title: `أهلًا ${saved.fullName?.split(' ')[0] ?? ''}`,
                description: 'بياناتك اتحفظت.',
              });
              const target = next();
              demo.setAfter(null);
              router.replace(target);
            }}
          />
        ) : (
          <div aria-busy="true" style={{ minHeight: 240 }} />
        )}
      </div>
    </section>
  );
}
