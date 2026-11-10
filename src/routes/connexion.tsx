import { createFileRoute } from '@tanstack/react-router';
import { SignIn } from './-connexion/SignIn';

/** `?ouvrir` : « fonder une partie », sur la une, arrive à l'ouverture d'un dossier. Écrite sans
 *  valeur, l'adresse (`/connexion?ouvrir`) la donne vide : elle ouvre aussi l'onglet. `?suite` :
 *  ce qu'on venait faire — fonder —, pour y arriver droit une fois le dossier ouvert. */
export const Route = createFileRoute('/connexion')({
  component: SignIn,
  validateSearch: (search: Record<string, unknown>): { ouvrir?: true; suite?: 'fonder' } => ({
    ...(search.ouvrir === true || search.ouvrir === '' ? { ouvrir: true as const } : {}),
    ...(search.suite === 'fonder' ? { suite: 'fonder' as const } : {}),
  }),
});
