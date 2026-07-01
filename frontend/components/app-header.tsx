import Link from 'next/link';
import { PhoneMissed } from 'lucide-react';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-700 text-white shadow-sm transition group-hover:scale-105">
            <PhoneMissed className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Missed Call Capture</p>
            <p className="text-xs text-slate-500">Mobile PDR Dashboard</p>
          </div>
        </Link>
      </div>
    </header>
  );
}
