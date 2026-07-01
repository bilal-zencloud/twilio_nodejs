import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: 'slate' | 'amber' | 'teal' | 'sky';
  highlight?: boolean;
}

const ACCENTS = {
  slate: 'from-slate-500 to-slate-700',
  amber: 'from-amber-500 to-orange-600',
  teal: 'from-teal-500 to-emerald-600',
  sky: 'from-sky-500 to-blue-600',
};

export function StatCard({ label, value, icon: Icon, accent, highlight }: StatCardProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md',
        highlight ? 'border-amber-200 ring-2 ring-amber-100' : 'border-slate-200'
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
            ACCENTS[accent]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
