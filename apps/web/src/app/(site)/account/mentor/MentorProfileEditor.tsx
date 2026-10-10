'use client';

import {
  GOVERNORATES,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  MENTOR_PRICE_EGP,
  MENTOR_PROFILE_LIMITS,
  SESSION_KINDS,
  SESSION_TYPES,
} from '@sabeq/types';
import { sessionPricePiasters } from '@sabeq/utils';
import { Avatar, Banner, Icon, useToast } from '@sabeq/ui';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { MentorMoney } from '@/components/account/MentorMoney';
import { Field, Select } from '@/components/form';
import { PageHead } from '@/components/PageHead';
import { ApiError } from '@/lib/api';
import {
  getOwnMentor,
  removeMentorPhoto,
  updateOwnMentor,
  uploadMentorPhoto,
  type OwnMentorProfile,
} from '@/lib/mentors';
import { useSignedIn } from '@/lib/use-signed-in';

const PRICES = Array.from(
  { length: (MENTOR_PRICE_EGP.max - MENTOR_PRICE_EGP.min) / MENTOR_PRICE_EGP.step + 1 },
  (_, i) => String(MENTOR_PRICE_EGP.min + i * MENTOR_PRICE_EGP.step),
);

/**
 * «ملفي كمرشد» (Phase 12 — not in the design handoff; built from the account page's cards and
 * the design-system form controls). What the mentor owns is editable; verified facts are not.
 */
export function MentorProfileEditor() {
  const user = useSignedIn('/account/mentor');
  const [mentor, setMentor] = useState<OwnMentorProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'failed'>('loading');

  useEffect(() => {
    if (user?.role !== 'mentor') return;
    getOwnMentor()
      .then((m) => {
        setMentor(m);
        setState('ready');
      })
      .catch((err: unknown) =>
        setState(err instanceof ApiError && err.status === 404 ? 'none' : 'failed'),
      );
  }, [user]);

  if (!user) return <div className="page-body" aria-busy="true" />;

  return (
    <>
      <PageHead
        crumbs={[
          { label: 'الرئيسية', href: '/' },
          { label: 'حسابي', href: '/account' },
          { label: 'ملفي كمرشد' },
        ]}
      >
        <div className="ph-row">
          <div>
            <h1 className="sb-h1">ملفي كمرشد</h1>
            <p className="sb-lead">ده اللي الطلبة بيشوفوه قبل ما يحجزوا معاك.</p>
          </div>
          <Link className="sb-btn sb-btn--secondary" href="/account/availability">
            <Icon name="calendar" />
            مواعيدي
          </Link>
          {mentor?.isListed ? (
            <Link className="sb-btn sb-btn--secondary" href={`/mentor/${mentor.slug}`}>
              <Icon name="user" />
              شوف ملفك زي الطلبة
            </Link>
          ) : null}
        </div>
      </PageHead>

      <section className="sb-container page-body acct">
        {user.role !== 'mentor' ? (
          <Banner kind="info" title="الصفحة دي للمرشدين">
            حسابك حساب طالب. لو درست في كلية وعايز تساعد غيرك،{' '}
            <Link href="/become-mentor">اعرف إزاي تبقى مرشد</Link>.
          </Banner>
        ) : state === 'loading' ? (
          <div className="sb-card acct-card" aria-busy="true" style={{ minHeight: 280 }} />
        ) : state === 'none' ? (
          <Banner kind="info" title="ملفك لسه ما اتعملش">
            ملف المرشد بيتعمل لما طلب انضمامك يتقبل.{' '}
            <Link href="/become-mentor/apply">تابع طلبك</Link>.
          </Banner>
        ) : state === 'failed' || !mentor ? (
          <Banner kind="error" title="حصلت مشكلة">
            ما قدرناش نجيب ملفك. حدّث الصفحة وجرّب تاني.
          </Banner>
        ) : (
          <Editor mentor={mentor} onSaved={setMentor} />
        )}
      </section>
    </>
  );
}

function Editor({
  mentor,
  onSaved,
}: {
  mentor: OwnMentorProfile;
  onSaved: (m: OwnMentorProfile) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({
    bio: mentor.bio,
    city: mentor.city ?? '',
    topics: mentor.topics,
    price: String(mentor.basePriceEgp ?? MENTOR_PRICE_EGP.min),
    acceptsBookings: mentor.acceptsBookings,
    departmentId: mentor.departmentId ?? '',
  });
  const [topic, setTopic] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(mentor.photo);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };
  const L = MENTOR_PROFILE_LIMITS;

  function addTopic() {
    const t = topic.replace(/\s+/g, ' ').trim();
    if (t.length < 2) return;
    if (f.topics.includes(t)) return setErrors({ topics: 'الموضوع ده موجود.' });
    if (f.topics.length >= L.topics) return setErrors({ topics: `${L.topics} مواضيع بالكتير.` });
    set('topics', [...f.topics, t.slice(0, L.topic)]);
    setTopic('');
  }
  const onTopicKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTopic();
    }
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await updateOwnMentor({
        bio: f.bio,
        city: f.city || null,
        topics: f.topics,
        basePriceEgp: Number(f.price),
        acceptsBookings: f.acceptsBookings,
        departmentId: f.departmentId || null,
      });
      onSaved(saved);
      toast({ kind: 'success', title: 'ملفك اتحفظ', description: 'بيظهر للطلبة خلال دقيقة.' });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'جرّب تاني.' });
    } finally {
      setBusy(false);
    }
  }

  const base = Number(f.price) * 100;

  return (
    <>
      <PhotoCard
        name={mentor.name ?? 'المرشد'}
        tone={mentor.tone}
        photo={photo}
        onChange={setPhoto}
      />

      <form className="sb-card acct-card" onSubmit={(e) => void submit(e)} noValidate>
        <h2 className="sb-h3">عنك</h2>
        <Field
          id="m-bio"
          label="نبذة عنك"
          error={errors.bio}
          hint={`${f.bio.length}/${L.bio} — اكتب بتشتغل إيه دلوقتي، وإيه اللي تقدر تساعد فيه.`}
        >
          <textarea
            id="m-bio"
            className="sb-input"
            style={{ height: 140, padding: '12px 14px' }}
            maxLength={L.bio}
            value={f.bio}
            onChange={(e) => set('bio', e.target.value)}
          />
        </Field>

        <Field
          id="m-topic"
          label="بتتكلم عن إيه"
          error={errors.topics}
          hint={`لحد ${L.topics} مواضيع. اكتب الموضوع واضغط Enter.`}
        >
          <div className="mp-topics">
            {f.topics.map((t) => (
              <button
                key={t}
                type="button"
                className="sb-chip sb-chip--sm"
                aria-label={`شيل ${t}`}
                onClick={() =>
                  set(
                    'topics',
                    f.topics.filter((x) => x !== t),
                  )
                }
              >
                {t}
                <span className="i16" aria-hidden="true">
                  <Icon name="x" />
                </span>
              </button>
            ))}
          </div>
          <div className="mp-topic-add">
            <input
              id="m-topic"
              className="sb-input"
              value={topic}
              maxLength={L.topic}
              placeholder="مثلًا: حاسبات ولا اتصالات؟"
              disabled={f.topics.length >= L.topics}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={onTopicKey}
            />
            <button
              type="button"
              className="sb-btn sb-btn--secondary"
              disabled={f.topics.length >= L.topics}
              onClick={addTopic}
            >
              ضيف
            </button>
          </div>
        </Field>

        <div className="mp-two">
          <Field id="m-city" label="المحافظة" error={errors.city}>
            <Select
              id="m-city"
              value={f.city}
              error={errors.city}
              placeholder="مش عايز أحددها"
              options={GOVERNORATES}
              onChange={(v) => set('city', v)}
            />
          </Field>
          <Field
            id="m-dept"
            label="القسم"
            error={errors.departmentId}
            hint={mentor.departments.length ? undefined : 'أقسام كليتك لسه مش متسجلة عندنا.'}
          >
            <Select
              id="m-dept"
              value={f.departmentId}
              error={errors.departmentId}
              placeholder="مش محدد"
              options={mentor.departments.map((d) => [d.id, d.name] as const)}
              onChange={(v) => set('departmentId', v)}
            />
          </Field>
        </div>

        <h2 className="sb-h3">السعر والحجز</h2>
        <Field
          id="m-price"
          label="سعر جلسة الاستشارة (45 دقيقة)"
          error={errors.basePriceEgp}
          hint="باقي الجلسات بتتحسب منه. سابق بياخد 10% من كل جلسة."
        >
          <Select
            id="m-price"
            value={f.price}
            error={errors.basePriceEgp}
            options={PRICES.map((p) => [p, `${p} ج.م`] as const)}
            onChange={(v) => v && set('price', v)}
          />
        </Field>
        <ul className="mp-prices">
          {SESSION_KINDS.map((k) => (
            <li key={k}>
              <span>
                {SESSION_TYPES[k].label} · {SESSION_TYPES[k].durationMin} دقيقة
              </span>
              <b>
                <span className="sb-num">
                  {sessionPricePiasters(base, SESSION_TYPES[k].multiplier) / 100}
                </span>{' '}
                ج.م
              </b>
            </li>
          ))}
        </ul>
        <label className="mp-check">
          <input
            type="checkbox"
            checked={f.acceptsBookings}
            onChange={(e) => set('acceptsBookings', e.target.checked)}
          />
          <span>
            <b>باخد حجوزات دلوقتي</b>
            <span className="sb-small">
              لو قفلتها ملفك بيفضل ظاهر، بس الطلبة مش هيقدروا يحجزوا لحد ما تفتحها.
            </span>
          </span>
        </label>

        <div>
          <button type="submit" className="sb-btn sb-btn--primary" aria-busy={busy} disabled={busy}>
            احفظ ملفي
          </button>
        </div>
      </form>

      <MentorMoney />

      <div className="sb-card acct-card">
        <h2 className="sb-h3">بيانات موثقة</h2>
        <p className="sb-small">
          دي اتراجعت بمستنداتك وبتظهر بعلامة «موثق». لو فيها غلط{' '}
          <Link href="/contact">كلّم الدعم</Link> وهنراجعها معاك.
        </p>
        <dl className="mp-verified">
          <dt>الصفة</dt>
          <dd>{mentor.verified.kindLabel}</dd>
          <dt>الكلية</dt>
          <dd>{mentor.verified.faculty}</dd>
          <dt>الجامعة</dt>
          <dd>{mentor.verified.university}</dd>
          <dt>التخصص</dt>
          <dd>{mentor.verified.major}</dd>
          {mentor.verified.graduationYear ? (
            <>
              <dt>سنة التخرج</dt>
              <dd className="sb-num">{mentor.verified.graduationYear}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </>
  );
}

function PhotoCard({
  name,
  tone,
  photo,
  onChange,
}: {
  name: string;
  tone: 1 | 2 | 3;
  photo: string | null;
  onChange: (photo: string | null) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<string | null>, done: string) {
    setBusy(true);
    try {
      onChange(await work());
      toast({ kind: 'success', title: done });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'جرّب تاني.' });
    } finally {
      setBusy(false);
    }
  }

  function pick(file: File | undefined) {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (!(LOGO_TYPES as readonly string[]).includes(file.type))
      return toast({ kind: 'error', title: 'الصورة لازم تكون PNG أو JPG أو WebP.' });
    if (file.size > LOGO_MAX_BYTES)
      return toast({ kind: 'error', title: 'الصورة لازم تكون أقل من 512 كيلوبايت.' });
    void run(() => uploadMentorPhoto(file), 'صورتك اتحفظت');
  }

  return (
    <div className="sb-card acct-card mp-photo">
      <Avatar name={name} size="xl" tone={tone} {...(photo ? { src: photo } : {})} />
      <div>
        <h2 className="sb-h3">صورتك</h2>
        <p className="sb-small">
          صورة واضحة لوشك بتطمّن الطالب. اختيارية — من غيرها بيظهر أول حرف من اسمك.
        </p>
        <div className="mp-photo-actions">
          <input
            ref={input}
            type="file"
            accept={LOGO_TYPES.join(',')}
            hidden
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <button
            type="button"
            className="sb-btn sb-btn--secondary sb-btn--sm"
            disabled={busy}
            aria-busy={busy}
            onClick={() => input.current?.click()}
          >
            {photo ? 'غيّر الصورة' : 'ارفع صورة'}
          </button>
          {photo ? (
            <button
              type="button"
              className="sb-btn sb-btn--ghost sb-btn--sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await removeMentorPhoto();
                  return null;
                }, 'الصورة اتشالت')
              }
            >
              شيل الصورة
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
