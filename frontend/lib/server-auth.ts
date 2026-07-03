import { cookies } from 'next/headers';
import { fetchMeServer, type AdminProfile } from './api';

/**
 * Forwardable cookie header string for server-side API calls.
 */
export async function getCookieHeader(): Promise<string> {
  const store = await cookies();
  return store
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

/**
 * Load the current admin from the API using the session cookie.
 * Returns null if not authenticated.
 */
export async function getCurrentAdmin(): Promise<AdminProfile | null> {
  const cookie = await getCookieHeader();
  if (!cookie) return null;
  try {
    const { admin } = await fetchMeServer(cookie);
    return admin;
  } catch {
    return null;
  }
}
