import { Navigate, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { useQueries } from 'convex/react';
import { useEffect, useMemo, useRef } from 'react';
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
export function SignedIn() {
  const token = useSession();
  const me = useAccount(token);
  if (token === null || me === null) return <Navigate to="/connexion" />;
  /** Le temps d'un aller-retour, rien : un écran de chargement entre deux feuilles du même
   *  journal se verrait comme un clignotement. */
  if (me === undefined) return null;
  return <Outlet />;
}

type Account = { readonly nickname: string };

/**
 * **Une panne de la porte ne ferme pas la maison.** `useQuery` relance ce que le serveur refuse,
 * et une erreur levée ici — un délai dépassé, le temps d'un déploiement — remontait à
 * l'`errorComponent` de la racine : le plateau était démonté sous les pieds du joueur pour une
 * requête qui ne dit qu'un pseudo. `useQueries` rend l'erreur au lieu de la lever, et la
 * dernière réponse connue tient la porte ouverte en attendant la suivante.
 *
 * **Seul un `null` explicite déconnecte** : c'est le serveur qui dit que la session ne vaut plus
 * rien, et c'est la seule chose qu'une panne ne peut pas dire à sa place.
 *
 * L'erreur n'est tolérée que **par-dessus une réponse** : sans rien de connu, il n'y a pas de
 * porte à tenir ouverte, et l'avaler donnerait une page blanche sans issue. Elle est relevée,
 * l'`errorComponent` de la racine la montre, et « réessayer » est une sortie.
 *
 * **Et l'objet de requêtes est mémoïsé, sinon la porte tourne à vide.** `useQueries` compare le
 * sien par **identité** (`useQueriesHelper`, `node_modules/convex/dist/esm/react/use_queries.js`)
 * et en tire l'abonnement qu'il tend à `useSubscription` ; un littéral neuf à chaque rendu donne
 * un abonnement neuf, que `useSubscription` traduit en `setState` **pendant le rendu**, lequel
 * refait un littéral. C'est la boucle — React #301, sur toutes les pages, le 13/09. `useQuery` ne
 * l'a jamais eue parce qu'il mémoïse le sien sur les arguments sérialisés ; ici il n'y a pas de
 * `useQuery` à qui déléguer, parce que c'est précisément sa levée d'erreur qu'on refuse.
 */
function useAccount(token: string | null): Account | null | undefined {
  const queries = useMemo(
    () => (token === null ? {} : { me: { query: api.accounts.me, args: { token } } }),
    [token],
  );
  const answers = useQueries(queries);
  const answer = answers.me as Account | null | undefined | Error;
  const known = useRef<Account | null | undefined>(undefined);
  if (!(answer instanceof Error)) {
    known.current = answer;
    return answer;
  }
  if (known.current === undefined) throw answer;
  return known.current;
}
