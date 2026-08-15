import { Navigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { forgetToken } from '@/data/token';

/**
 * A token the server no longer recognizes — a season deleted, a stale local entry. It is not
 * an outage: the token is dropped and the player goes back to the entry screen, where
 * "resume" simply stops being offered.
 *
 * The drop happens in an effect and not while rendering: `forgetToken` notifies its
 * subscribers, and writing to a store during another component's render is exactly what
 * makes React warn about updating one component while rendering another.
 */
export function StaleToken({ to }: { to: '/accueil' | '/salon' }) {
  useEffect(() => {
    forgetToken();
  }, []);
  return <Navigate to={to} />;
}
