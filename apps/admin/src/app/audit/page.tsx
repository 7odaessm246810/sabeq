import type { Metadata } from 'next';
import { AuditLog } from './AuditLog';

export const metadata: Metadata = { title: 'سجل العمليات' };

export default function AuditPage() {
  return <AuditLog />;
}
