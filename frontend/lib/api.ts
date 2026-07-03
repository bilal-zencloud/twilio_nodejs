import type {
  ConfirmPayload,
  Lead,
  LeadDetailResponse,
  LeadsResponse,
} from './types';

export const CLIENT_API_URL = process.env.NEXT_PUBLIC_API_URL || '';
export const SERVER_API_URL =
  process.env.API_SERVER_URL ||
  process.env.API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:3000';

/**
 * Server-side fetch: forwards the browser's session cookie to the API.
 * Pass an incoming cookie string (from Next.js `cookies()`) for RSC calls.
 */
export async function serverFetch<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${SERVER_API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      cookie,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Client-side fetch: browser sends cookies automatically with credentials: 'include'.
 */
async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CLIENT_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export interface FetchLeadsParams {
  page?: string | number;
  status?: string;
  search?: string;
}

export async function fetchLeadsServer(cookie: string, params: FetchLeadsParams = {}) {
  const query = new URLSearchParams();
  query.set('limit', '30');
  if (params.page) query.set('page', String(params.page));
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.search) query.set('search', params.search);

  return serverFetch<LeadsResponse>(`/api/leads?${query.toString()}`, cookie);
}

export async function fetchLeadServer(id: string | number, cookie: string) {
  return serverFetch<LeadDetailResponse>(`/api/leads/${id}`, cookie);
}

export async function confirmLead(id: string | number, payload: ConfirmPayload) {
  return clientFetch<{ success: boolean; lead: Lead }>(`/api/leads/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function login(email: string, password: string) {
  return clientFetch<{ admin: AdminProfile }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return clientFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return clientFetch<{ success: boolean }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
}

export interface AdminProfile {
  id: number;
  email: string;
  account_id: string | null;
}

export async function fetchMeServer(cookie: string) {
  return serverFetch<{ admin: AdminProfile }>('/api/auth/me', cookie);
}
