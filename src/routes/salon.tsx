import { createFileRoute } from '@tanstack/react-router';
import { errorCode } from '@/data/errors';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleSeat } from '@/shell/StaleSeat';
import { Lobby } from './-salon/Lobby';

export const Route = createFileRoute('/salon')({
  component: Lobby,
  errorComponent: ({ error, reset }) => <LobbyError error={error} reset={reset} />,
});

/** Une place morte au salon n'est pas une panne : on l'oublie et on rentre à l'accueil. */
function LobbyError({ error, reset }: { error: unknown; reset: () => void }) {
  const code = errorCode(error);
  if (code === 'NO_SEAT' || code === 'SEASON_GONE') return <StaleSeat to="/accueil" />;
  return <ErrorScreen error={error} reset={reset} />;
}
