import CN from 'country-flag-icons/string/3x2/CN';
import DE from 'country-flag-icons/string/3x2/DE';
import FR from 'country-flag-icons/string/3x2/FR';
import GB from 'country-flag-icons/string/3x2/GB';
import IT from 'country-flag-icons/string/3x2/IT';
import JP from 'country-flag-icons/string/3x2/JP';
import US from 'country-flag-icons/string/3x2/US';
import type { Nation } from '@/domaine/nations';
import urss from './urss.svg?raw';

/**
 * Les tracés officiels de `country-flag-icons`, ratio 3:2 — moins de 4 Ko en tout,
 * incorporés en data-URI plutôt qu'en huit requêtes.
 *
 * **Règle unique : on ne déforme jamais un drapeau.** Chaque emploi lui donne une boîte
 * au ratio 3:2 et construit la mise en page autour, jamais l'inverse. Étirer sur une
 * bande large transforme le disque japonais en ellipse ; recadrer n'en montre qu'une
 * tranche. C'est la boîte qui s'adapte.
 *
 * Deux exceptions : l'**URSS** n'existe dans aucun paquet, son tracé est à nous ;
 * l'**Allemagne** porte le tricolore actuel, jamais le drapeau de 1940.
 */

const enImage = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

const IMAGE_PAR_NATION: Readonly<Record<Nation, string>> = {
  France: enImage(FR),
  'Royaume-Uni': enImage(GB),
  'États-Unis': enImage(US),
  URSS: enImage(urss),
  Allemagne: enImage(DE),
  Japon: enImage(JP),
  Italie: enImage(IT),
  Chine: enImage(CN),
};

/**
 * Un drapeau officiel est saturé : posé tel quel il crève le budget de contraste,
 * qui appartient à la couche de jeu. Ce filtre le ramène dans la palette.
 */
const FILTRE_CARTOUCHE = 'saturate(.45) sepia(.28) brightness(.85) contrast(1.05)';
const FILTRE_FILIGRANE = 'saturate(.4) sepia(.22) brightness(1.15)';

export function imageDeNation(nation: string | null): string | null {
  return nation !== null && nation in IMAGE_PAR_NATION ? IMAGE_PAR_NATION[nation as Nation] : null;
}

/**
 * Filigrane — le drapeau ancré à gauche d'une bande sombre, fondu vers la droite.
 * Le conteneur fait exactement 3:2 (`aspect-[3/2] h-full`), donc le tracé réel tient
 * sans être déformé, et le fondu court sur sa propre largeur.
 * **Réservé aux fonds sombres** : sur papier, le drapeau vire au bloc gris.
 */
const MASQUE_FILIGRANE = 'linear-gradient(to right, #000 0%, #000 52%, transparent 100%)';

export function FiligraneDrapeau({ nation, opacite = 0.6 }: { nation: string | null; opacite?: number }) {
  const image = imageDeNation(nation);
  if (image === null) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 aspect-[3/2]"
      style={{
        opacity: opacite,
        backgroundImage: image,
        backgroundSize: '100% 100%',
        filter: FILTRE_FILIGRANE,
        maskImage: MASQUE_FILIGRANE,
        WebkitMaskImage: MASQUE_FILIGRANE,
      }}
    />
  );
}

/**
 * Bannière — le drapeau plein cadre, au ratio 3:2. C'est le traitement de l'écran
 * de choix : la carte est dessinée autour du drapeau, pas l'inverse.
 */
export function BanniereDrapeau({ nation }: { nation: string | null }) {
  const image = imageDeNation(nation);
  return (
    <span
      aria-hidden
      className="block aspect-[3/2] w-full"
      style={
        image === null
          ? { background: 'var(--routine)' }
          : { backgroundImage: image, backgroundSize: '100% 100%', filter: FILTRE_CARTOUCHE }
      }
    />
  );
}

/**
 * Cartouche — le traitement des listes et des surfaces papier.
 * Le drapeau sert d'identifiant ; il ne doit pas concurrencer les compteurs.
 */
export function Drapeau({
  nation,
  largeur = 27,
  surPapier = false,
}: {
  nation: string | null;
  largeur?: number;
  surPapier?: boolean;
}) {
  const image = imageDeNation(nation);
  return (
    <span
      aria-hidden
      title={nation ?? undefined}
      className="relative block shrink-0 border"
      style={{
        width: largeur,
        height: Math.round((largeur * 2) / 3),
        borderColor: surPapier ? 'var(--ink)' : 'var(--paper)',
        ...(image === null ? { background: 'var(--routine)' } : {}),
        ...(surPapier ? {} : { boxShadow: '0 1px 0 rgba(23,18,8,.8)' }),
      }}
    >
      {image !== null && (
        <span
          className="absolute inset-0"
          style={{ backgroundImage: image, backgroundSize: '100% 100%', filter: FILTRE_CARTOUCHE }}
        />
      )}
      <span
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.10), rgba(23,18,8,.22))' }}
      />
    </span>
  );
}
