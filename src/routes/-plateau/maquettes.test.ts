import { describe, expect, it } from 'vitest';
import type { MapMarker } from '@/domain/labels';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { objectiveMaquette } from '@/emblems/objectives/manifest';
import { maquettesOf } from './maquettes';
import { buildMinutes } from '../../../convex/constants';

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

  it('smokes over my producers at work, and over nothing else', () => {
    const idle = building({ id: 'i', buildingId: 'b2' });
    expect(
      maquettesOf([building(), idle], () => undefined, new Set(['b1'])).map((m) => m.smoking),
    ).toEqual([true, undefined]);
  });

  it('keeps an upgrade standing, and raises a first level by the scale of its first level', () => {
    const upgrade = building({ finishesAt: 1, plate: null });
    const site = building({ id: 's', buildingId: null, level: null, finishesAt: 9, plate: null });
    expect(maquettesOf([upgrade, site], () => undefined).map((m) => [m.id, m.rising])).toEqual([
      ['building-FRA-5328-mine', undefined],
      ['s', { finishesAt: 9, minutes: buildMinutes('mine', 1) }],
    ]);
  });

  it('washes an aged survey, stands an emptied objective whole, and nothing else', () => {
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
