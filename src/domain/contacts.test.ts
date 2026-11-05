import { describe, expect, it } from 'vitest';
import type { City } from './atlas';
import { contactsOf } from './contacts';
import type { LonLat } from './geo';
import type { CampView, PlayerView, TroopView } from './player-view';

const METZ: LonLat = [6.18, 49.12];
const cities: City[] = [
  { lonLat: METZ, name: 'Metz', capital: false, population: 120_000 },
  { lonLat: [-4.49, 48.39], name: 'Brest', capital: false, population: 140_000 },
  { lonLat: [0.11, 49.49], name: 'Le Havre', capital: false, population: 170_000 },
];

/** A degree of longitude at 49° N is about 73 km. */
const east = (km: number, from: LonLat = METZ): LonLat => [from[0] + km / 73, from[1]];

const point = (lonLat: LonLat) =>
  ({
    kind: 'point',
    lonLat,
    country: 'FRA',
    afloat: false,
    ground: 'land',
    coastal: false,
  }) as const;
let troopCount = 0;
const troop = (role: TroopView['role'], stationedAt: TroopView['stationedAt']) =>
  ({ id: `t${troopCount++}`, role, stationedAt }) as unknown as TroopView;
const camp = (id: string, at: LonLat, extra: Partial<CampView> = {}) =>
  ({
    id,
    point: at,
    medium: 'land',
    since: 1000,
    lastKnown: false,
    identification: { pierced: false },
    ...extra,
  }) as CampView;

function view({
  troops = [],
  camps = [],
  arcs = [],
  outposts = [],
  buildings = [],
}: {
  troops?: TroopView[];
  camps?: CampView[];
  arcs?: unknown[];
  outposts?: unknown[];
  buildings?: unknown[];
}) {
  return {
    mode: 'mondiale',
    theatre: null,
    me: { troops, outposts, buildings },
    camps,
    arcs,
  } as unknown as PlayerView;
}

describe('contactsOf — where my forces touch what I surveyed', () => {
  it('rings a surveyed camp inside the detection range of one of my piles, named after the nearest city', () => {
    const [contact, ...rest] = contactsOf(
      view({
        troops: [troop('infantry', point(east(40))), troop('armor', point(east(40)))],
        camps: [camp('c1', east(80), { since: 2000 })],
      }),
      cities,
    );
    expect(rest).toEqual([]);
    expect(contact).toMatchObject({
      number: 1,
      troops: 2,
      seen: 1,
      latest: 2000,
      name: 'à l’est de Metz',
      pinIds: [`stack-point:${east(40)[0]},${east(40)[1]}`, 'camp-c1'],
    });
  });

  it('reads the range off the pile’s roles: a fighter sees a camp an infantry does not', () => {
    const at = east(100);
    const infantry = view({ troops: [troop('infantry', point(METZ))], camps: [camp('c', at)] });
    const fighter = view({ troops: [troop('fighter', point(METZ))], camps: [camp('c', at)] });
    expect(contactsOf(infantry, cities)).toEqual([]);
    expect(contactsOf(fighter, cities)).toHaveLength(1);
  });

  it('leaves out a last known position, a marching troop and an empty building', () => {
    const marching = troop('infantry', point(METZ));
    expect(
      contactsOf(
        view({
          troops: [marching],
          arcs: [{ state: 'mine', troopIds: [marching.id] }],
          buildings: [{ id: 'b1', key: 'barracks', point: METZ }],
          camps: [camp('lost', east(10), { lastKnown: true }), camp('c', east(10))],
        }),
        cities,
      ),
    ).toEqual([]);
  });

  it('counts the garrison of an outpost and of a building, from the troops standing there', () => {
    const [contact] = contactsOf(
      view({
        troops: [
          troop('infantry', { kind: 'outpost', outpostId: 'o1' }),
          troop('infantry', { kind: 'building', buildingId: 'b1' }),
          troop('artillery', { kind: 'building', buildingId: 'b1' }),
        ],
        outposts: [{ id: 'o1', lonLat: METZ }],
        buildings: [{ id: 'b1', key: 'barracks', point: east(30) }],
        camps: [camp('c', east(15))],
      }),
      cities,
    );
    expect(contact?.troops).toBe(3);
    expect(contact?.pinIds).toEqual([
      'outpost-o1',
      `building-barracks@${east(30)[0]},${east(30)[1]}`,
      'camp-c',
    ]);
  });

  it('chains pairs into one contact, numbers contacts by their oldest sighting and dates each by its latest', () => {
    const far: LonLat = [-4.49, 48.39];
    const contacts = contactsOf(
      view({
        troops: [
          troop('infantry', point(METZ)),
          troop('infantry', point(east(80))),
          troop('cargo', { ...point(east(-20, far)), afloat: true, ground: 'sea' }),
        ],
        camps: [
          camp('a', east(40), { since: 5000 }),
          camp('b', east(110), { since: 9000 }),
          camp('sea', east(-30, far), { since: 3000, medium: 'sea' }),
        ],
      }),
      cities,
    );
    expect(
      contacts.map(({ number, seen, latest, name }) => ({ number, seen, latest, name })),
    ).toEqual([
      { number: 1, seen: 1, latest: 3000, name: 'au large de Brest' },
      { number: 2, seen: 2, latest: 9000, name: 'à l’est de Metz' },
    ]);
  });

  it('says « devant » a city it touches, and elides its article', () => {
    const havre: LonLat = [0.11, 49.49];
    const [contact] = contactsOf(
      view({
        troops: [troop('infantry', point(havre))],
        camps: [camp('c', [0.12, 49.5])],
      }),
      cities,
    );
    expect(contact?.name).toBe('devant Le Havre');
    const [offshore] = contactsOf(
      view({
        troops: [troop('cargo', point(havre))],
        camps: [camp('c', [0.12, 49.5], { medium: 'sea' })],
      }),
      cities,
    );
    expect(offshore?.name).toBe('au large du Havre');
  });

  it('reads the range off the theatre in a Blitz: the Pacific sees further than the Mondiale', () => {
    const tokyo: LonLat = [139.7, 35.7];
    const at: LonLat = [tokyo[0] + 150 / 90, tokyo[1]];
    const blitz = (theatre: string | null) => ({
      ...view({ troops: [troop('infantry', point(tokyo))], camps: [camp('c', at)] }),
      mode: theatre === null ? 'mondiale' : 'blitz',
      theatre,
    });
    expect(contactsOf(blitz(null), cities)).toEqual([]);
    expect(contactsOf(blitz('pacific') as PlayerView, cities)).toHaveLength(1);
  });

  it('draws no contact once nothing is surveyed', () => {
    expect(contactsOf(view({ troops: [troop('infantry', point(METZ))] }), cities)).toEqual([]);
  });
});
