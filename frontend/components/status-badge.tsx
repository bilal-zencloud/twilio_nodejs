import { cn, formatStatus } from '@/lib/utils';
import type { LeadStatus } from '@/lib/types';

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: 'bg-sky-50 text-sky-700 ring-sky-200',
  contacted: 'bg-orange-50 text-orange-700 ring-orange-200',
  qualifying: 'bg-rose-50 text-rose-700 ring-rose-200',
  captured: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending_confirmation: 'bg-amber-50 text-amber-800 ring-amber-200',
  confirmed: 'bg-teal-50 text-teal-800 ring-teal-200',
  closed: 'bg-slate-100 text-slate-600 ring-slate-200',
};

interface StatusBadgeProps {
  status: LeadStatus;
  className?: string;
  pulse?: boolean;
}

export function StatusBadge({ status, className, pulse }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset',
        STATUS_STYLES[status],
        pulse && status === 'pending_confirmation' && 'animate-pulse',
        className
      )}
    >
      {status === 'pending_confirmation' && (
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}
      {formatStatus(status)}
    </span>
  );
}
