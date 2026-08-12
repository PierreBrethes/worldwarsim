import type { PalierUnite } from '@/domaine/troupes';
import { libelleRole, type RoleUnite } from '@/domaine/vue-joueur';
import { urlSprite } from './unites/manifeste';

/**
 * Même logique que le filtre des drapeaux : la direction artistique est une passe
 * d'affichage, jamais cuite dans l'asset. Un sprite recuit à l'encre ne resservirait
 * ni au rejeu ni à une palette révisée, et se réencoderait à chaque retouche de la DA.
 */
const FILTRE_ENCRE = 'saturate(.5) sepia(.22) brightness(.94)';

/**
 * `largeur` fixe la boîte, pas l'image : les rapports vont du fantassin debout au navire
 * couché sur toute sa longueur, donc à hauteur égale une colonne de sprites part en dents
 * de scie. `object-contain` laisse chaque sujet respirer dans une boîte commune.
 */
export function SpriteUnite({
  nation,
  role,
  palier = 1,
  hauteur,
  largeur,
}: {
  nation: string | null;
  role: RoleUnite;
  palier?: PalierUnite;
  hauteur: number;
  largeur?: number;
}) {
  const libelle = libelleRole(role, 1);
  const url = urlSprite(nation, role, palier);
  if (url === null) return <RoleSansVisuel libelle={libelle} hauteur={hauteur} largeur={largeur} />;
  return (
    <img
      src={url}
      alt=""
      title={libelle}
      // Pas d'`image-rendering: pixelated` : ce sont des rendus, pas des pixel-sprites.
      className="block shrink-0 object-contain"
      style={{ height: hauteur, width: largeur ?? 'auto', filter: FILTRE_ENCRE }}
    />
  );
}

/**
 * Le cargo n'a pas de visuel, et sept nations sur huit n'en ont aucun : un `<img>` cassé
 * les signalerait par une icône de navigateur, hors palette et sans dire de quoi il s'agit.
 */
function RoleSansVisuel({
  libelle,
  hauteur,
  largeur,
}: {
  libelle: string;
  hauteur: number;
  largeur: number | undefined;
}) {
  return (
    <span
      title={libelle}
      className="flex shrink-0 items-center justify-center overflow-hidden border border-dashed px-1 text-center leading-[1.1] uppercase"
      style={{
        height: hauteur,
        width: largeur ?? 'auto',
        minWidth: largeur ?? hauteur,
        borderColor: 'var(--ink-soft)',
        color: 'var(--ink-soft)',
        fontSize: 'var(--size-eyebrow-sm)',
        letterSpacing: 'var(--track-eyebrow)',
      }}
    >
      {libelle}
    </span>
  );
}
