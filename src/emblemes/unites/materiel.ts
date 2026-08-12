import type { Nation } from '@/domaine/nations';
import type { PalierUnite } from '@/domaine/troupes';
import type { RoleUnite } from '@/domaine/vue-joueur';

/**
 * Le nom du matériel réel, par nation et par palier. Il vit ici, à côté des sprites, et non
 * dans le domaine : « char léger R35 » est une propriété de la planche française, pas de la
 * règle du jeu. Le jour où la France change de char, l'asset et cette ligne bougent ensemble
 * et `RoleUnite` ne bouge pas.
 */
type MaterielNation = Readonly<Partial<Record<RoleUnite, ReadonlyArray<string>>>>;

const FRANCE: MaterielNation = {
  infanterie: ['soldat', 'bazooka'],
  blinde: ['char léger R35', 'char lourd B1 bis'],
  transportTerrestre: ['VTC'],
  chasseur: ['Dewoitine D.520'],
  bombardier: ['LeO 451'],
  transportAerien: ['D.338'],
  escorte: ['Le Fantasque'],
  porteAvions: ['2 appareils'],
};

const MATERIEL_PAR_NATION: Readonly<Partial<Record<Nation, MaterielNation>>> = {
  France: FRANCE,
};

export function libelleMateriel(
  nation: string | null,
  role: RoleUnite,
  palier: PalierUnite,
): string | null {
  const nationale =
    nation !== null && nation in MATERIEL_PAR_NATION
      ? MATERIEL_PAR_NATION[nation as Nation]
      : undefined;
  const paliers = nationale?.[role];
  if (paliers === undefined) return null;
  return paliers[palier - 1] ?? paliers[0] ?? null;
}
