import { describe, expect, it } from 'vitest';
import type { MapMarker } from '@/domain/labels';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { objectiveMaquette } from '@/emblems/objectives/manifest';
import { maquettesOf } from './maquettes';

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
  finishesAt: null,
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

  it('keeps an upgrade standing, and leaves a first level under the crane to its plate', () => {
    const upgrade = building({ finishesAt: 1, plate: null });
    const site = building({ id: 's', buildingId: null, level: null, finishesAt: 1, plate: null });
    expect(maquettesOf([upgrade, site], () => undefined).map((m) => m.id)).toEqual([
      'building-FRA-5328-mine',
    ]);
  });

  it('washes an aged survey and an emptied objective, and stands nothing else', () => {
    const survey: MapMarker = {
      kind: 'installation',
      id: 'installation-x',
      buildingId: 'x',
      key: 'farm',
      regionId: 'DEU-DE21',
      name: 'Ferme',
      plate: 'farm.webp',
      washed: true,
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
    const deposit: MapMarker = { kind: 'deposit', id: 'd', regionId: 'FRA-5328', deposit: 'coal' };
    expect(
      maquettesOf([survey, objective, deposit], (id) => (id === 'o' ? 'fuelDump' : undefined)),
    ).toEqual([
      {
        id: 'installation-x',
        at: { regionId: 'DEU-DE21' },
        url: buildingMaquette('farm', null),
        washed: true,
      },
      {
        id: 'objective-o',
        at: { lonLat: [10, 50] },
        url: objectiveMaquette('fuelDump'),
        washed: true,
      },
    ]);
  });
});
