import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SessionRoom } from './SessionRoom';

export const metadata: Metadata = {
  title: 'الجلسة',
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session room (Phase 17). Everything personal is loaded in the browser, signed in. */
export default async function SessionRoomPage({ params }: PageProps<'/sessions/[id]'>) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return <SessionRoom id={id} />;
}
