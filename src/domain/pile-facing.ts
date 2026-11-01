import { bearingDegrees, type LonLat } from './geo';

/**
 * **Le cap d'une pile posée** (#362) : une colonne qui arrive sur un point regarde où elle allait,
 * le cap de la fin de sa route (degrés depuis le nord) ; une pile déjà là garde le sien, et la
 * colonne qui la rejoint le prend. `undefined` quand la route ne dit pas d'où elle vient, ou que la
 * pile rejointe n'en a pas.
 */
export function arrivalFacing(
  route: ReadonlyArray<LonLat>,
  standing: ReadonlyArray<{ readonly facing?: number | undefined }>,
): number | undefined {
  if (standing.length > 0) return standing.find(({ facing }) => facing !== undefined)?.facing;
  const end = route.at(-1);
  const from = [...route].reverse().find(([lon, lat]) => lon !== end?.[0] || lat !== end?.[1]);
  return end === undefined || from === undefined ? undefined : bearingDegrees(from, end);
}
