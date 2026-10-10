import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UsersList } from './UsersList';

export const metadata: Metadata = { title: 'الحسابات' };

export default function UsersPage() {
  return (
    <Suspense fallback={<main className="adm-loading" aria-busy="true" />}>
      <UsersList />
    </Suspense>
  );
}
