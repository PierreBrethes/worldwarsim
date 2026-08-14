import { Link, useSearch } from '@tanstack/react-router';
import type { Doctrine } from '@/domaine/vue-joueur';
import { FiligraneDrapeau } from '@/emblemes/Drapeau';
import { avecModale, type RecherchePlateau } from '@/routes/plateau';

/**
 * Le drapeau touche le bord de la surface et le texte démarre là où le filigrane s'éteint.
 * Sa boîte reste au ratio 3:2 — on ne déforme jamais un drapeau — donc sa largeur se déduit
 * de la hauteur, et le retrait du texte avec elle : rien à réaccorder à la main.
 * **Fond sombre seulement**, comme tout emploi du filigrane.
 *
 * Le cartouche entier est la porte de la fiche de nation, texte compris : on clique le nom
 * qu'on veut consulter, pas une vignette à côté de lui.
 */
/**
 * Le filigrane ne s'éteint pas net : sa queue court encore un peu après le point calculé, et
 * une lettre posée dessus se lit sur deux fonds. Cet air se compte en pixels, jamais en
 * fraction de la hauteur — c'est la dégradation du masque qu'il rattrape, pas une proportion.
 */
const AIR_APRES_FILIGRANE = 6;

export function CartoucheNation({
  nation,
  doctrine,
  hauteur,
}: {
  nation: string | null;
  doctrine: Doctrine;
  hauteur: number;
}) {
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  return (
    <Link
      to="/plateau"
      search={avecModale(recherche, 'nation')}
      title={`${nation ?? 'sans nation'} — fiche de nation`}
      className="relative flex shrink-0 items-center overflow-hidden pr-5 whitespace-nowrap hover:brightness-125"
      style={{ height: hauteur }}
    >
      <FiligraneDrapeau nation={nation} />
      <div
        className="relative flex flex-col justify-center gap-[2px]"
        style={{
          paddingLeft: Math.round(hauteur * 1.5 * 0.8) + AIR_APRES_FILIGRANE,
          textShadow: '0 1px 3px rgba(23,18,8,.9)',
        }}
      >
        <span className="font-[var(--font-display)] text-[19px] leading-none font-extrabold tracking-[.02em] text-[var(--paper)] uppercase">
          {nation ?? 'sans nation'}
        </span>
        <span className="eyebrow-sombre leading-none">doctrine {doctrine}</span>
      </div>
    </Link>
  );
}
