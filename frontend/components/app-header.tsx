'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PhoneMissed, ChevronDown, KeyRound, LogOut, User } from 'lucide-react';
import { logout, type AdminProfile } from '@/lib/api';
import { SessionIdleLogout } from '@/components/session-idle-logout';

interface AppHeaderProps {
  admin?: AdminProfile | null;
}

export function AppHeader({ admin }: AppHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      // Best-effort — proceed to redirect either way.
    }
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      {admin && <SessionIdleLogout />}
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

        {admin && (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                <User className="h-3.5 w-3.5" />
              </div>
              <span className="hidden max-w-[160px] truncate sm:inline">{admin.email}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-xs text-slate-500">Signed in as</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-900">{admin.email}</p>
                </div>
                <Link
                  href="/change-password"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
                >
                  <KeyRound className="h-4 w-4 text-slate-500" />
                  Change password
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={signingOut}
                  className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <LogOut className="h-4 w-4 text-slate-500" />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
