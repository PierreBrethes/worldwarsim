import { buildingMaquette } from '@/emblems/buildings/manifest';
import type { StandingMaquette } from '@/map/engine';

/**
 * **A vitrine for the sites on their socle** (#365), on a dev server or the banc's build, with
 * `?socle`: `?niveau=1` to `3` (#366) stands my barracks at that level, and `?socle=vitrine` stands
 * by my first barracks a surveyed one, an aged survey and a neutral of the Blitz, which the
 * Mondiale demo does not serve. A production build drops it all.
 */
export function withSocleFixture(maquettes: StandingMaquette[]): StandingMaquette[] {
  if (!(import.meta.env.DEV || import.meta.env.VITE_BANC === '1')) return maquettes;
  const flag = new URLSearchParams(location.search).get('socle');
  if (flag === null) return maquettes;
  const barracks = buildingMaquette('barracks', null);
  const level = Number(new URLSearchParams(location.search).get('niveau'));
  const swapped = maquettes.map((maquette) =>
    maquette.url === barracks && level >= 1 && maquette.side === 'mine' && !maquette.works
      ? { ...maquette, level }
      : maquette,
  );
  const mine = swapped.find((m) => m.url === barracks && m.side === 'mine' && !m.works);
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
