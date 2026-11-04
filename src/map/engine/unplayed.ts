import type { MapMotion } from '@/domain/map-motion';

/**
 * **Ce qu'un geste qui ne joue pas laisse** (#277) : un anneau d'encre là où il finit, en
 * réduites, ou en actives quand il ne pouvait pas jouer (une pile dessinée par rôle, une couronne
 * au-delà du pool). Rien sous un combat au point (`veiled`, #272), ni coupées.
 */
export function ringsLeft(
  motion: MapMotion,
  { veiled, unplayable }: { readonly veiled: boolean; readonly unplayable: boolean },
): boolean {
  if (veiled || motion === 'off') return false;
  return motion === 'reduced' || unplayable;
}
