'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { logout } from '@/lib/api';

const DEFAULT_IDLE_MINUTES = 15;
const ACTIVITY_EVENTS = [
  'click',
  'keydown',
  'mousemove',
  'scroll',
  'touchstart',
  'visibilitychange',
] as const;

export function SessionIdleLogout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signingOutRef = useRef(false);

  useEffect(() => {
    const idleMs =
      Number(process.env.NEXT_PUBLIC_SESSION_INACTIVITY_MINUTES || DEFAULT_IDLE_MINUTES) *
      60 *
      1000;

    async function signOutForInactivity() {
      if (signingOutRef.current) return;
      signingOutRef.current = true;

      try {
        await logout();
      } catch {
        // Best-effort. The server-side cookie also expires independently.
      }

      router.replace('/login?reason=inactive');
      router.refresh();
    }

    function resetTimer() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(signOutForInactivity, idleMs);
    }

    resetTimer();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, resetTimer, { passive: true })
    );

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [router]);

  return null;
}
