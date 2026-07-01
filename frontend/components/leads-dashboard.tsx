'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Filter, Users, Clock, CheckCircle2, Activity } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { StatCard } from '@/components/stat-card';
import { cn, formatDate, formatPhone, truncate } from '@/lib/utils';
import type { Lead, LeadStats, LeadStatus } from '@/lib/types';

const FILTERS: { id: 'all' | LeadStatus | 'action'; label: string }[] = [
  { id: 'all', label: 'All leads' },
  { id: 'action', label: 'Needs action' },
  { id: 'pending_confirmation', label: 'Pending' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'qualifying', label: 'Qualifying' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'closed', label: 'Closed' },
];

interface LeadsDashboardProps {
  initialLeads: Lead[];
  stats: LeadStats;
  accountId: string;
}

export function LeadsDashboard({ initialLeads, stats, accountId }: LeadsDashboardProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initialLeads.filter((lead) => {
      const matchesSearch =
        !q ||
        lead.name?.toLowerCase().includes(q) ||
        lead.caller_phone.includes(q) ||
        lead.need_summary?.toLowerCase().includes(q) ||
        lead.location?.toLowerCase().includes(q);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'action' && lead.status === 'pending_confirmation') ||
        lead.status === filter;

      return matchesSearch && matchesFilter;
    });
  }, [initialLeads, search, filter]);

  return (
    <div className="space-y-8">
      {stats.pending > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">
            {stats.pending} lead{stats.pending === 1 ? '' : 's'} ready to confirm
          </p>
          <p className="mt-1 text-sm text-amber-800/80">
            Review scheduling details and photos, then confirm inspection or repair visits.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total leads" value={stats.total} icon={Users} accent="slate" />
        <StatCard
          label="Pending confirmation"
          value={stats.pending}
          icon={Clock}
          accent="amber"
          highlight={stats.pending > 0}
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
            {filtered.length} of {initialLeads.length} shown
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
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

        {filtered.length === 0 ? (
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className={cn(
                      'group transition hover:bg-slate-50/80',
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
                        pulse={lead.status === 'pending_confirmation'}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-400">Account: {accountId}</p>
    </div>
  );
}
