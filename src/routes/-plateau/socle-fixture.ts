import { BUILDING_FOOTPRINT_METRES } from '@/domain/piece-size';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import type { StandingMaquette } from '@/map/engine';

/** Served by the dev server from the repository, and copied by the banc next to its build. */
const FIXTURE = '/src/emblems/fixtures/barracks-socle.glb';
/** **The fixture's socle, its widest side in metres**: what the ring spaces it by. */
const SOCLE_METRES = 80;

/**
 * **Today's barracks on its socle, in place of the real one** (#365), on a dev server or the
 * banc's build, with `?socle`: Pierre's GLBs (#368) are not drawn yet. `?socle=vitrine` stands
 * by my first barracks a surveyed one, an aged survey and a neutral of the Blitz, which the
 * Mondiale demo does not serve. A production build drops it all.
 */
export function withSocleFixture(maquettes: StandingMaquette[]): StandingMaquette[] {
  if (!(import.meta.env.DEV || import.meta.env.VITE_BANC === '1')) return maquettes;
  const flag = new URLSearchParams(location.search).get('socle');
  if (flag === null) return maquettes;
  const barracks = buildingMaquette('barracks', null);
  // `?niveau=1` to `3` (#366) stands my barracks at that level, to see each yard without waiting
  // for the works: the demo has one level 3 barracks and no finished level 1.
  const level = Number(new URLSearchParams(location.search).get('niveau'));
  const swapped = maquettes.map((maquette) =>
    maquette.url !== barracks
      ? maquette
      : {
          ...maquette,
          url: FIXTURE,
          socle: true,
          ...(level >= 1 && maquette.side === 'mine' && !maquette.works && { level }),
          footprint:
            ((maquette.footprint ?? maquette.span) * SOCLE_METRES) /
            BUILDING_FOOTPRINT_METRES.barracks,
        },
  );
  const mine = swapped.find((m) => m.url === FIXTURE && m.side === 'mine' && !m.works);
  if (flag !== 'vitrine' || mine === undefined) return swapped;
  // A survey serves no nation: no ink.
  const { ink: _mine, ...survey } = mine;
  const shown = (id: string, more: Partial<StandingMaquette>): StandingMaquette => ({
    ...survey,
    // A survey serves no level: the first yard, as `maquettesOf` serves it.
    level: 1,
    id: `installation-vitrine-${id}`,
    smoking: false,
    ...more,
  });
  return [
    ...swapped,
    shown('seen', { side: 'seen' }),
    shown('washed', { side: 'seen', washed: true }),
    shown('neutral', { side: 'neutral' }),
  ];
}
