import type { Metadata } from 'next';
import { listMembers } from '../../lib/queries';
import MemberGrid from '../../components/MemberGrid';

export const metadata: Metadata = {
  title: 'Lok Sabha Members',
  description: 'Browse every current member of the Lok Sabha, the lower house of the Parliament of India.',
};

export const revalidate = 300;

export default async function LokSabhaPage() {
  let members: Awaited<ReturnType<typeof listMembers>>['members'] = [];
  let total = 0;
  let loadError = false;

  try {
    const result = await listMembers({ house: 'lok_sabha', page: 1 });
    members = result.members;
    total = result.total;
  } catch {
    loadError = true;
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold text-navy-900">Lok Sabha</h1>
      <p className="mt-2 text-slate-600">
        {total > 0 ? `${total} sitting members` : 'The lower house of the Parliament of India.'}
      </p>

      {loadError ? (
        <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Couldn&apos;t load members right now — check your Supabase connection.
        </p>
      ) : (
        <div className="mt-6">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <MemberGrid house="lok_sabha" initialMembers={members as any} initialTotal={total} />
        </div>
      )}
    </div>
  );
}
