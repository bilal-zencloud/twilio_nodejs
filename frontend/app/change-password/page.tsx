'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, KeyRound, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { PasswordInput } from '@/components/password-input';
import { changePassword } from '@/lib/api';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_current_password: 'Current password is incorrect.',
  password_too_short: 'New password must be at least 8 characters.',
  current_and_new_password_required: 'Please fill out both fields.',
  passwords_do_not_match: 'New password and confirmation do not match.',
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function updateField(setter: (value: string) => void, value: string) {
    setter(value);
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (next !== confirm) {
      setError(ERROR_MESSAGES.passwords_do_not_match);
      return;
    }
    if (next.length < 8) {
      setError(ERROR_MESSAGES.password_too_short);
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(current, next);
      setSuccess(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      const key = err instanceof Error ? err.message : 'change_password_failed';
      setError(ERROR_MESSAGES[key] || 'Could not change password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <KeyRound className="h-5 w-5 text-slate-700" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Change password</h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Update your admin account password.
              </p>
            </div>
          </div>

          {success && (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
              <div>
                <p className="font-semibold">Password updated</p>
                <p className="mt-0.5 text-teal-800">Your new password is now in effect.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Current password</span>
              <PasswordInput
                required
                autoComplete="current-password"
                value={current}
                onChange={(value) => updateField(setCurrent, value)}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">New password</span>
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={next}
                onChange={(value) => updateField(setNext, value)}
              />
              <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Confirm new password</span>
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(value) => updateField(setConfirm, value)}
              />
            </label>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  'Update password'
                )}
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </>
  );
}
