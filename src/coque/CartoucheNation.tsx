import { Link, useSearch } from '@tanstack/react-router';
import { FiligraneDrapeau } from '@/emblemes/Drapeau';
import { avecModale, type RecherchePlateau } from '@/routes/plateau';

/**
 * Le drapeau seul. Le bandeau ne répond plus qu'à « quoi de neuf », et sa propre nation n'est
 * une nouvelle pour personne : le nom et la doctrine sont dans la fiche, dont le cartouche
 * reste la porte.
 *
 * Pas de cadre : le filigrane s'éteint de lui-même vers la droite. Sa boîte reste au ratio
 * 3:2 — on ne déforme jamais un drapeau — donc la largeur se déduit de la hauteur.
 */
export function CartoucheNation({ nation, hauteur }: { nation: string | null; hauteur: number }) {
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  return (
    <Link
      to="/plateau"
      search={avecModale(recherche, 'nation')}
      title={`${nation ?? 'sans nation'} — fiche de nation`}
      className="relative shrink-0 hover:brightness-125"
      style={{ height: hauteur, width: Math.round(hauteur * 1.5) }}
    >
      <FiligraneDrapeau nation={nation} />
    </Link>
  );
}
