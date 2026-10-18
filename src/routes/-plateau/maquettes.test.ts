import { describe, expect, it } from 'vitest';
import type { MapMarker } from '@/domain/labels';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { objectiveMaquette } from '@/emblems/objectives/manifest';
import { maquettesOf } from './maquettes';
import type { WorkSite } from '@/domain/construction';
import { asClockTime } from '@/domain/duration';

const building = (over: Partial<Extract<MapMarker, { kind: 'building' }>> = {}): MapMarker => ({
  kind: 'building',
  id: 'building-FRA-5328-mine',
  lonLat: null,
  buildingId: 'b1',
  key: 'mine',
  regionId: 'FRA-5328',
  regionName: 'Nord',
  hostCountry: 'FRA',
  name: 'Mine',
  level: 1,
  plate: 'mine.webp',
  works: null,
  reach: null,
  ink: '#000',
  ...over,
});

describe('maquettesOf', () => {
  it('stands a building on its region, a port on its quay, and a mine by its ground', () => {
    const port = building({ id: 'p', key: 'port', lonLat: [2, 51], regionId: 'FRA-5262' });
    expect(maquettesOf([building(), port], () => undefined)).toEqual([
      {
        id: 'building-FRA-5328-mine',
        at: { regionId: 'FRA-5328' },
        url: buildingMaquette('mine', 'coal'),
        washed: false,
      },
      { id: 'p', at: { lonLat: [2, 51] }, url: buildingMaquette('port', null), washed: false },
    ]);
  });

  it('smokes over my producers at work, and over nothing else', () => {
    const idle = building({ id: 'i', buildingId: 'b2' });
    expect(
      maquettesOf([building(), idle], () => undefined, new Set(['b1'])).map((m) => m.smoking),
    ).toEqual([true, undefined]);
  });

  it('dresses a site by its works: a plan queued, a level rising or raised, its stamp dated', () => {
    const works = (
      phase: WorkSite['phase'],
      level: number,
      finishesAt: number | null,
    ): WorkSite => ({
      phase,
      key: 'mine',
      regionId: 'FRA-5328',
      regionName: 'Nord',
      point: null,
      level,
      rank: 0,
      finishesAt,
      minutes: 40,
    });
    const at = 1_700_000_000_000;
    const upgrade = building({ works: works('raising', 3, at) });
    const site = building({
      id: 's',
      buildingId: null,
      level: null,
      works: works('rising', 1, at),
    });
    const plan = building({
      id: 'q',
      buildingId: null,
      level: null,
      works: works('queued', 1, null),
    });
    const stamp = { word: 'achevé', hour: asClockTime(at) };
    expect(maquettesOf([upgrade, site, plan], () => undefined).map((m) => [m.id, m.works])).toEqual(
      [
        [
          'building-FRA-5328-mine',
          { phase: 'raising', level: 3, finishesAt: at, minutes: 40, pennant: 'niv. 3', stamp },
        ],
        ['s', { phase: 'rising', level: 1, finishesAt: at, minutes: 40, pennant: null, stamp }],
        [
          'q',
          { phase: 'queued', level: 1, finishesAt: null, minutes: 40, pennant: null, stamp: null },
        ],
      ],
    );
  });

  it('washes an aged survey, stands an emptied objective whole, and nothing else', () => {
    const survey: MapMarker = {
      kind: 'installation',
      id: 'installation-x',
      buildingId: 'x',
      key: 'farm',
      regionId: 'DEU-DE21',
      lonLat: [11.5, 48.1],
      name: 'Ferme',
      plate: 'farm.webp',
      washed: true,
      neutral: null,
    };
    const objective: MapMarker = {
      kind: 'objective',
      id: 'objective-o',
      objectiveId: 'o',
      lonLat: [10, 50],
      name: 'Dépôt',
      tier: 'facile',
      plate: 'fuelDump.webp',
      depot: '',
      emptied: true,
    };
    const deposit: MapMarker = { kind: 'deposit', id: 'd', lonLat: [6.6, 49], deposit: 'coal' };
    expect(
      maquettesOf([survey, objective, deposit], (id) => (id === 'o' ? 'fuelDump' : undefined)),
    ).toEqual([
      {
        id: 'installation-x',
        at: { lonLat: [11.5, 48.1] },
        url: buildingMaquette('farm', null),
        washed: true,
      },
      {
        id: 'objective-o',
        at: { lonLat: [10, 50] },
        url: objectiveMaquette('fuelDump'),
        washed: false,
      },
    ]);
  });

  it('stands no objective whose archetype the view does not name', () => {
    const objective: MapMarker = {
      kind: 'objective',
      id: 'objective-o',
      objectiveId: 'o',
      lonLat: [10, 50],
      name: '',
      tier: '',
      plate: null,
      depot: '',
      emptied: false,
    };
    expect(maquettesOf([objective], () => undefined)).toEqual([]);
  });
});
