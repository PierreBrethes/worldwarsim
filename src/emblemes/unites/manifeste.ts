import type { Nation } from '@/domaine/nations';
import type { PalierUnite } from '@/domaine/troupes';
import type { RoleUnite } from '@/domaine/vue-joueur';
import blinde1 from './france/blinde-1.webp';
import blinde2 from './france/blinde-2.webp';
import bombardier from './france/bombardier.webp';
import chasseur from './france/chasseur.webp';
import escorte from './france/escorte.webp';
import infanterie1 from './france/infanterie-1.webp';
import infanterie2 from './france/infanterie-2.webp';
import porteAvions from './france/porteAvions.webp';
import transportAerien from './france/transportAerien.webp';
import transportTerrestre from './france/transportTerrestre.webp';

/**
 * Un rôle à palier expose ses deux niveaux, les autres n'en ont structurellement qu'un.
 * L'union évite un champ `palier` optionnel qu'on finirait par lire sur un porte-avions.
 */
export type VisuelUnite =
  | { readonly genre: 'unique'; readonly url: string }
  | { readonly genre: 'paliers'; readonly paliers: readonly [string, string] };

/**
 * `null` dit « ce rôle n'a pas encore de visuel », et le `Record` complet force chaque nation
 * ajoutée à se prononcer sur les neuf rôles : un oubli devient une erreur de compilation, pas
 * une image absente découverte à l'écran.
 */
export type NationSprites = Readonly<Record<RoleUnite, VisuelUnite | null>>;

const FRANCE: NationSprites = {
  infanterie: { genre: 'paliers', paliers: [infanterie1, infanterie2] },
  blinde: { genre: 'paliers', paliers: [blinde1, blinde2] },
  transportTerrestre: { genre: 'unique', url: transportTerrestre },
  chasseur: { genre: 'unique', url: chasseur },
  bombardier: { genre: 'unique', url: bombardier },
  transportAerien: { genre: 'unique', url: transportAerien },
  escorte: { genre: 'unique', url: escorte },
  cargo: null,
  porteAvions: { genre: 'unique', url: porteAvions },
};

export const SPRITES_PAR_NATION: Readonly<Partial<Record<Nation, NationSprites>>> = {
  France: FRANCE,
};

export function urlSprite(
  nation: string | null,
  role: RoleUnite,
  palier: PalierUnite,
): string | null {
  const sprites =
    nation !== null && nation in SPRITES_PAR_NATION
      ? SPRITES_PAR_NATION[nation as Nation]
      : undefined;
  const visuel = sprites?.[role];
  if (visuel === undefined || visuel === null) return null;
  if (visuel.genre === 'unique') return visuel.url;
  return palier === 1 ? visuel.paliers[0] : visuel.paliers[1];
}
