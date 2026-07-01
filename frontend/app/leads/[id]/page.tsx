import Link from 'next/link';
import { AppHeader } from '@/components/app-header';
import { LeadDetail } from '@/components/lead-detail';
import { fetchLead } from '@/lib/api';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadPage({ params }: PageProps) {
  const { id } = await params;

  try {
    const data = await fetchLead(id);

    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <LeadDetail
            initialLead={data.lead}
            messages={data.messages}
            photos={data.photos}
            accountId={data.accountId}
            appointmentTypes={data.appointmentTypes}
          />
        </main>
      </>
    );
  } catch {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-7xl flex-1 px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Lead not found</h1>
          <p className="mt-2 text-sm text-slate-500">This lead may have been removed or does not exist.</p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white"
          >
            Back to dashboard
          </Link>
        </main>
      </>
    );
  }
}
