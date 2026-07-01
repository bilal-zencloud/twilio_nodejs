import { AppHeader } from '@/components/app-header';
import { LeadsDashboard } from '@/components/leads-dashboard';
import { fetchLeads } from '@/lib/api';

export default async function HomePage() {
  let data;
  let error: string | null = null;

  try {
    data = await fetchLeads();
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load leads';
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
            <p className="font-semibold text-red-900">Could not connect to API</p>
            <p className="mt-2 text-sm text-red-700">{error}</p>
            <p className="mt-4 text-xs text-red-600">
              Make sure the backend is running on port 3000:{' '}
              <code className="rounded bg-red-100 px-1.5 py-0.5">npm run dev:api</code>
            </p>
          </div>
        ) : data ? (
          <LeadsDashboard
            initialLeads={data.leads}
            stats={data.stats}
            accountId={data.accountId}
          />
        ) : null}
      </main>
    </>
  );
}
