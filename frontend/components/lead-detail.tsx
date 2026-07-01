'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Phone,
  Mail,
  Wrench,
  Search,
  Send,
  Loader2,
  CheckCircle2,
  X,
  ZoomIn,
} from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import { confirmLead } from '@/lib/api';
import { cn, formatDate, formatPhone } from '@/lib/utils';
import type { AppointmentType, Lead, Message, Photo } from '@/lib/types';

interface LeadDetailProps {
  initialLead: Lead;
  messages: Message[];
  photos: Photo[];
  accountId: string;
  appointmentTypes: Record<string, AppointmentType>;
}

export function LeadDetail({
  initialLead,
  messages,
  photos,
  accountId,
  appointmentTypes,
}: LeadDetailProps) {
  const [lead, setLead] = useState(initialLead);
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(
    appointmentTypes.REPAIR || 'repair'
  );
  const [preferredTime, setPreferredTime] = useState(lead.preferred_time || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const canConfirm = lead.status === 'pending_confirmation';

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await confirmLead(lead.id, {
        account_id: accountId,
        appointment_type: appointmentType,
        preferred_time: preferredTime,
      });
      setLead(result.lead);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leads
      </Link>

      {success && (
        <div className="flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
          <div>
            <p className="font-semibold text-teal-900">Appointment confirmed</p>
            <p className="mt-1 text-sm text-teal-800">
              Confirmation SMS sent to {formatPhone(lead.caller_phone)}.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {lead.name || 'Unknown caller'}
                </h1>
                <p className="mt-1 text-sm text-slate-500">Lead #{lead.id}</p>
              </div>
              <StatusBadge status={lead.status} pulse={canConfirm} />
            </div>

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <InfoRow icon={Phone} label="Phone" value={formatPhone(lead.caller_phone)} />
              <InfoRow icon={Mail} label="Email" value={lead.email || '—'} />
              <InfoRow icon={Wrench} label="Need" value={lead.need_summary || '—'} className="sm:col-span-2" />
              <InfoRow icon={Clock} label="Preferred time" value={lead.preferred_time || '—'} />
              <InfoRow icon={MapPin} label="Location" value={lead.location || '—'} />
              {lead.appointment_type && (
                <InfoRow
                  icon={Search}
                  label="Appointment type"
                  value={lead.appointment_type}
                  className="capitalize"
                />
              )}
              {lead.confirmed_time && (
                <InfoRow icon={CheckCircle2} label="Confirmed time" value={lead.confirmed_time} />
              )}
            </dl>

            <p className="mt-4 text-xs text-slate-400">
              Created {formatDate(lead.created_at)} · Updated {formatDate(lead.updated_at)}
            </p>
          </div>

          {photos.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                Damage photos ({photos.length})
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightbox(photo.url)}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt="Damage photo"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 transition group-hover:opacity-100" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Conversation</h2>
            <div className="mt-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-slate-500">No messages yet.</p>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 text-sm',
                      msg.direction === 'inbound'
                        ? 'mr-auto rounded-bl-md bg-slate-100 text-slate-800'
                        : 'ml-auto rounded-br-md bg-slate-900 text-white'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p
                      className={cn(
                        'mt-1.5 text-[10px] uppercase tracking-wide',
                        msg.direction === 'inbound' ? 'text-slate-400' : 'text-slate-400'
                      )}
                    >
                      {msg.direction} · {formatDate(msg.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {canConfirm ? (
            <form
              onSubmit={handleConfirm}
              className="sticky top-24 rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold text-slate-900">Confirm appointment</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review details and photos, then choose inspection or repair. The customer will
                receive a confirmation SMS.
              </p>

              <fieldset className="mt-5 space-y-2">
                <legend className="text-sm font-medium text-slate-700">Appointment type</legend>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition has-[:checked]:border-slate-900 has-[:checked]:ring-2 has-[:checked]:ring-slate-200">
                  <input
                    type="radio"
                    name="appointment_type"
                    value={appointmentTypes.REPAIR}
                    checked={appointmentType === appointmentTypes.REPAIR}
                    onChange={() => setAppointmentType(appointmentTypes.REPAIR)}
                    className="accent-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Repair</p>
                    <p className="text-xs text-slate-500">Schedule a repair visit</p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition has-[:checked]:border-slate-900 has-[:checked]:ring-2 has-[:checked]:ring-slate-200">
                  <input
                    type="radio"
                    name="appointment_type"
                    value={appointmentTypes.INSPECTION}
                    checked={appointmentType === appointmentTypes.INSPECTION}
                    onChange={() => setAppointmentType(appointmentTypes.INSPECTION)}
                    className="accent-slate-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Inspection</p>
                    <p className="text-xs text-slate-500">Assess damage in person first</p>
                  </div>
                </label>
              </fieldset>

              <label className="mt-5 block">
                <span className="text-sm font-medium text-slate-700">Preferred time</span>
                <input
                  type="text"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  placeholder="e.g. Thursday afternoon"
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Confirm &amp; send SMS
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Status</h2>
              <p className="mt-2 text-sm text-slate-600">
                {lead.status === 'confirmed'
                  ? 'This lead has been confirmed and the customer was notified.'
                  : 'This lead is not ready for confirmation yet. Waiting for scheduling details from the customer.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Damage photo enlarged"
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-3', className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
        <dd className="mt-0.5 text-sm text-slate-900">{value}</dd>
      </div>
    </div>
  );
}
