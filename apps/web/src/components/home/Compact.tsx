import Link from 'next/link';

/**
 * The short home page (2026-10-20): what happens in three steps, and one line for graduates.
 * Replaced the long story sections — every claim here is something the product really does.
 */
const STEPS = [
  ['اختار الكلية', 'دوّر على الكلية أو القسم اللي بتفكر فيه.'],
  ['اختار مستشارك', 'خريج أو معيد أو دكتور في نفس الكلية، مستنداته اتراجعت قبل ما يظهر.'],
  ['احجز واتكلم', 'جلسة فيديو في الميعاد اللي يناسبك، والدفع أونلاين.'],
] as const;

export function QuickSteps() {
  return (
    <section className="sb-section" id="how">
      <div className="sb-container">
        <h2 className="sb-h2 qsteps-title">إزاي بيشتغل؟</h2>
        <ol className="qsteps">
          {STEPS.map(([title, text], i) => (
            <li key={title}>
              <span className="n" aria-hidden="true">
                {i + 1}
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function JoinBand() {
  return (
    <section className="sb-section">
      <div className="sb-container">
        <div className="join-band">
          <div>
            <h2 className="sb-h2">درست الكلية دي؟</h2>
            <p className="sb-lead">ساعد طلاب الثانوية يختاروا صح، وحدد سعرك ومواعيدك بنفسك.</p>
          </div>
          <Link href="/become-mentor" className="sb-btn sb-btn--primary sb-btn--lg">
            انضم كمستشار أكاديمي
          </Link>
        </div>
      </div>
    </section>
  );
}
