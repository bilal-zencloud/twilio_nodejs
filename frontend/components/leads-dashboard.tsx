'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  Filter,
  Users,
  Clock,
  CheckCircle2,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { StatCard } from '@/components/stat-card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { closeLead } from '@/lib/api';
import { cn, formatDate, formatPhone, truncate } from '@/lib/utils';
import type { Lead, LeadPagination, LeadStats, LeadStatus } from '@/lib/types';

const FILTERS: { id: 'all' | LeadStatus | 'action'; label: string }[] = [
  { id: 'all', label: 'All leads' },
  { id: 'action', label: 'Needs action' },
  { id: 'human_follow_up', label: 'Human Follow-Up' },
  { id: 'pending_confirmation', label: 'Pending' },
  { id: 'awaiting_consent', label: 'Awaiting consent' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualifying', label: 'Qualifying' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'closed', label: 'Closed' },
  { id: 'opted_out', label: 'Opted out' },
];

interface LeadsDashboardProps {
  initialLeads: Lead[];
  stats: LeadStats;
  pagination: LeadPagination;
  accountId: string;
}

export function LeadsDashboard({
  initialLeads,
  stats,
  pagination,
  accountId,
}: LeadsDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(pagination.search || '');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>(
    (pagination.status as (typeof FILTERS)[number]['id']) || 'all'
  );
  const [closingId, setClosingId] = useState<number | null>(null);
  const [pendingCloseId, setPendingCloseId] = useState<number | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const start = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.total);

  function buildHref(next: {
    page?: number;
    status?: string;
    search?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const page = next.page ?? pagination.page;
    const status = next.status ?? filter;
    const query = next.search ?? search;

    if (page > 1) params.set('page', String(page));
    else params.delete('page');

    if (status && status !== 'all') params.set('status', status);
    else params.delete('status');

    if (query.trim()) params.set('search', query.trim());
    else params.delete('search');

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      router.replace(buildHref({ page: 1, search }));
    }, 350);

    return () => window.clearTimeout(timer);
    // Search is intentionally debounced; filters/pagination update immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    setSearch(pagination.search || '');
    setFilter((pagination.status as (typeof FILTERS)[number]['id']) || 'all');
  }, [pagination.search, pagination.status]);

  function handleFilter(nextFilter: (typeof FILTERS)[number]['id']) {
    setFilter(nextFilter);
    router.push(buildHref({ page: 1, status: nextFilter }));
  }

  function handleCloseLead(leadId: number) {
    setCloseError(null);
    setPendingCloseId(leadId);
  }

  async function confirmCloseLead() {
    if (pendingCloseId == null) return;
    setClosingId(pendingCloseId);
    try {
      await closeLead(pendingCloseId);
      setPendingCloseId(null);
      router.refresh();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Could not close lead');
    } finally {
      setClosingId(null);
    }
  }

  return (
    <div className="space-y-8">
      {(stats.humanFollowUp || 0) > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 px-5 py-4">
          <p className="text-sm font-semibold text-indigo-900">
            {stats.humanFollowUp} lead{stats.humanFollowUp === 1 ? '' : 's'} in Human Follow-Up
          </p>
          <p className="mt-1 text-sm text-indigo-800/80">
            Open a lead to read the exact SMS summary sent to Devin. Close it from the list or the
            lead page when the job is done.
          </p>
        </div>
      )}

      {closeError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          {closeError}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total leads" value={stats.total} icon={Users} accent="slate" />
        <StatCard
          label="Human Follow-Up"
          value={stats.humanFollowUp || 0}
          icon={Clock}
          accent="amber"
          highlight={(stats.humanFollowUp || 0) > 0}
        />
        <StatCard label="Confirmed" value={stats.confirmed} icon={CheckCircle2} accent="teal" />
        <StatCard label="In progress" value={stats.active} icon={Activity} accent="sky" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search name, phone, need, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Showing {start}-{end} of {pagination.total}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => handleFilter(f.id)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition',
                filter === f.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {initialLeads.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No leads match your filters</p>
            <p className="mt-1 text-sm text-slate-500">Try adjusting search or filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-semibold">Lead</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Need</th>
                  <th className="px-5 py-3 font-semibold">When</th>
                  <th className="px-5 py-3 font-semibold">Location</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Last activity</th>
                  <th className="px-5 py-3 font-semibold"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {initialLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      'group transition hover:bg-slate-50/80',
                      lead.status === 'human_follow_up' && 'bg-indigo-50/40',
                      lead.status === 'pending_confirmation' && 'bg-amber-50/40'
                    )}
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="block font-medium text-slate-900 group-hover:text-slate-700"
                      >
                        {lead.name || 'Unknown caller'}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatPhone(lead.caller_phone)} · #{lead.id}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge
                        status={lead.status}
                        pulse={
                          lead.status === 'pending_confirmation' ||
                          lead.status === 'human_follow_up'
                        }
                      />
                    </td>
                    <td className="max-w-[180px] px-5 py-4 text-slate-600">
                      {lead.need_summary ? truncate(lead.need_summary, 50) : '—'}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {lead.preferred_time ? truncate(lead.preferred_time, 28) : '—'}
                    </td>
                    <td className="max-w-[160px] px-5 py-4 text-slate-600">
                      {lead.location ? truncate(lead.location, 32) : '—'}
                    </td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(lead.created_at)}</td>
                    <td className="px-5 py-4 text-slate-500">
                      {lead.last_activity_at ? formatDate(lead.last_activity_at) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {lead.status !== 'closed' ? (
                        <button
                          type="button"
                          onClick={() => handleCloseLead(lead.id)}
                          disabled={closingId === lead.id}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                        >
                          {closingId === lead.id ? 'Closing…' : 'Close'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.totalPages} · 30 leads max per page
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={buildHref({ page: pagination.page - 1 })}
                aria-disabled={!pagination.hasPreviousPage}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition',
                  pagination.hasPreviousPage
                    ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    : 'pointer-events-none border-slate-100 bg-slate-50 text-slate-300'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Link>
              <Link
                href={buildHref({ page: pagination.page + 1 })}
                aria-disabled={!pagination.hasNextPage}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition',
                  pagination.hasNextPage
                    ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    : 'pointer-events-none border-slate-100 bg-slate-50 text-slate-300'
                )}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-400">Account: {accountId}</p>

      <ConfirmDialog
        open={pendingCloseId != null}
        title="Close this lead?"
        description="The lead will be marked Closed. Messages, photos, voicemails, and consent records stay on this record. A new call or text from this number will start a new lead."
        confirmLabel="Close Lead"
        loading={closingId != null}
        onConfirm={confirmCloseLead}
        onClose={() => {
          if (closingId == null) setPendingCloseId(null);
        }}
      />
    </div>
  );
}
