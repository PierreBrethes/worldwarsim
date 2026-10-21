import type { RegionType } from '@/domain/ids';
import desert from './desert.svg';
import forest from './forest.svg';
import jungle from './jungle.svg';
import mountain from './mountain.svg';
import plain from './plain.svg';
import tundra from './tundra.svg';

/**
 * Les six pictos de terrain de la maquette #194, un par `RegionType` : la fiche d'une région dit
 * son terrain avec. Décor pur, aucune règle ne lit le type (`CLAUDE.md`, « Données générées »).
 * Le `Record` est complet : un type de plus sans picto arrête la compilation.
 */
export const TERRAIN_PICTOS: Readonly<Record<RegionType, string>> = {
  plain,
  forest,
  jungle,
  mountain,
  desert,
  tundra,
};
