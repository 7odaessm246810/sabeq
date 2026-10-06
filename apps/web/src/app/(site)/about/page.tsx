import type { Metadata } from 'next';
import { TextPage } from '@/components/TextPage';

export const metadata: Metadata = {
  title: 'عن سابق',
  description: 'سابق منصة مصرية بتوصل طلاب الثانوية بطلاب وخريجين موثقين درسوا فعلًا في الكلية.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <TextPage title="عن سابق">
      <p>
        سابق منصة مصرية بتوصل طلاب الثانوية بطلاب وخريجين موثقين درسوا فعلًا في الكلية اللي بيفكروا
        فيها.
      </p>
      <p>
        بدأنا من سؤال بيتكرر كل سنة: «أدخل كلية إيه؟». المعلومات موجودة في كل مكان، لكن التجربة
        الحقيقية مش موجودة. سابق بيحل ده.
      </p>
    </TextPage>
  );
}
