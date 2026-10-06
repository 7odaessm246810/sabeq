import { Icon } from '@sabeq/ui';
import type { Metadata } from 'next';
import { TextPage } from '@/components/TextPage';

export const metadata: Metadata = {
  title: 'المساعدة',
  description: 'إزاي تحجز جلسة، تلغي، والجلسة بتتم إزاي على سابق.',
  alternates: { canonical: '/help' },
};

const FAQ = [
  {
    q: 'إزاي أحجز جلسة؟',
    a: 'اختار كلية، بعدين مرشد، واضغط «احجز جلسة». هتختار النوع واليوم والوقت وتدفع.',
  },
  { q: 'أقدر ألغي؟', a: 'أيوه، مجانًا لحد 24 ساعة قبل الجلسة، والمبلغ بيرجع كامل.' },
  { q: 'الجلسة بتتم إزاي؟', a: 'فيديو أو صوت جوه المنصة. اللينك بيوصلك قبلها بساعة.' },
] as const;

export default function HelpPage() {
  return (
    <TextPage title="المساعدة">
      {FAQ.map((item, i) => (
        <details key={item.q} className="sb-card qa" open={i === 0}>
          <summary>
            {item.q}
            <span className="i18">
              <Icon name="chevron" />
            </span>
          </summary>
          <p>{item.a}</p>
        </details>
      ))}
    </TextPage>
  );
}
