import { Navigate, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { useEffect } from 'react';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { convexClient } from '@/data/convexClient';
import { errorMessage } from '@/data/errors';
import { useSession } from '@/data/session';
import { Notifications, notify } from '@/shell/notifications';

export const Route = createRootRoute({
  component: Root,
  errorComponent: ({ error, reset }) => <ErrorScreen error={error} reset={reset} />,
});

function Root() {
  // The last-row net: an orphan promise (mutation without `.catch`, timer…) becomes a
  // dismissible dispatch instead of silence. Render errors, in turn, climb to the routes'
  // `errorComponent`.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      console.error(event.reason);
      notify(errorMessage(event.reason) ?? fr.unexpectedError);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  const pathname = useRouterState({ select: (state) => state.location.pathname });
  /** La page de connexion est la seule à s'ouvrir sans compte — c'est celle qui en donne un.
   *  Sans backend, personne ne garde rien : l'accueil dit déjà ce qui manque. */
  const open = !convexClient || pathname === '/connexion';

  return (
    <>
      {open ? <Outlet /> : <SignedIn />}
      <Notifications />
      <div className="grain" aria-hidden />
    </>
  );
}

/**
 * **La porte du jeu est le compte** (ADR 0022), et elle est ici plutôt que dans chaque écran :
 * une surface qui aurait oublié la garde aurait servi un plateau vide à un inconnu, et la
 * prochaine surface l'aurait oubliée aussi.
 *
 * Elle ne lit pas le `localStorage` seul : un jeton révoqué (déconnexion ailleurs, mot de passe
 * réinitialisé) y survit très bien. C'est le serveur qui dit si la session vaut encore quelque
 * chose, et `null` de sa part est la réponse, jamais une erreur.
 */
function SignedIn() {
  const token = useSession();
  const me = useQuery(api.accounts.me, token === null ? 'skip' : { token });
  if (token === null || me === null) return <Navigate to="/connexion" />;
  /** Le temps d'un aller-retour, rien : un écran de chargement entre deux feuilles du même
   *  journal se verrait comme un clignotement. */
  if (me === undefined) return null;
  return <Outlet />;
}
