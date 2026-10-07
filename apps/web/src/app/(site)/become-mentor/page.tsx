import type { Metadata } from 'next';
import { BecomeMentor } from './BecomeMentor';

export const metadata: Metadata = {
  title: 'كن مرشدًا',
  description:
    'لو خريج أو معيد أو دكتور جامعة، ساعد طلاب الثانوية يختاروا صح، وحدد سعرك ومواعيدك بنفسك.',
  alternates: { canonical: '/become-mentor' },
};

export default function BecomeMentorPage() {
  return <BecomeMentor />;
}
