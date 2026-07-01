const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const DEFAULT_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_DEFAULT_ACCOUNT_ID || 'demo-account-1';

export function getAccountId(): string {
  return DEFAULT_ACCOUNT_ID;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  return res.json();
}

export async function fetchLeads(accountId = getAccountId()) {
  return apiFetch<import('./types').LeadsResponse>(
    `/api/leads?account_id=${encodeURIComponent(accountId)}`
  );
}

export async function fetchLead(id: string | number, accountId = getAccountId()) {
  return apiFetch<import('./types').LeadDetailResponse>(
    `/api/leads/${id}?account_id=${encodeURIComponent(accountId)}`
  );
}

export async function confirmLead(
  id: string | number,
  payload: import('./types').ConfirmPayload
) {
  return apiFetch<{ success: boolean; lead: import('./types').Lead }>(
    `/api/leads/${id}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export { API_URL, DEFAULT_ACCOUNT_ID };
