import { describe, expect, it } from 'vitest';
import type { City } from './atlas';
import { contactFacingsOf, contactsOf } from './contacts';
import { bearingDegrees } from './geo';
import { stackLabelId } from './force-highlight';
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
    const blitz = (theatre: string | null) =>
      ({
        ...view({ troops: [troop('infantry', point(tokyo))], camps: [camp('c', at)] }),
        mode: theatre === null ? 'mondiale' : 'blitz',
        theatre,
      }) as PlayerView;
    expect(contactsOf(blitz(null), cities)).toEqual([]);
    expect(contactsOf(blitz('pacific'), cities)).toHaveLength(1);
  });

  it('draws no contact once nothing is surveyed', () => {
    expect(contactsOf(view({ troops: [troop('infantry', point(METZ))] }), cities)).toEqual([]);
  });
});

describe('contactFacingsOf — the way a pile at a point turns toward what it touches (#641)', () => {
  const pileId = (at: LonLat) => stackLabelId(point(at));
  const facingsOf = (v: PlayerView) => contactFacingsOf(v);

  it('turns a pile toward the one camp in its detection range, as the bearing says', () => {
    const camp1 = east(40);
    const facings = facingsOf(
      view({ troops: [troop('infantry', point(METZ))], camps: [camp('c', camp1)] }),
    );
    expect(facings.get(pileId(METZ))).toBeCloseTo(bearingDegrees(METZ, camp1), 6);
    expect(facings.size).toBe(1);
  });

  it('turns it toward the nearer of two camps, then the smaller id at equal distance', () => {
    const far = east(60);
    const near: LonLat = [METZ[0] - 20 / 73, METZ[1]];
    const nearest = facingsOf(
      view({
        troops: [troop('infantry', point(METZ))],
        camps: [camp('a', far), camp('b', near)],
      }),
    );
    expect(nearest.get(pileId(METZ))).toBeCloseTo(270, 0);
    // Mirrored about the pile's meridian, the two distances are the same to the bit.
    const origin: LonLat = [0, 49];
    const tie = (ids: [string, string]) =>
      facingsOf(
        view({
          troops: [troop('infantry', point(origin))],
          camps: [camp(ids[0], [0.5, 49]), camp(ids[1], [-0.5, 49])],
        }),
      ).get(pileId(origin));
    expect(tie(['a', 'b'])).toBeCloseTo(90, 0);
    expect(tie(['b', 'a'])).toBeCloseTo(270, 0);
  });

  it('ignores a last known position, a camp out of range, and takes a camp of the sea as it is', () => {
    expect(
      facingsOf(
        view({
          troops: [troop('infantry', point(METZ))],
          camps: [camp('lost', east(10), { lastKnown: true }), camp('far', east(400))],
        }),
      ).size,
    ).toBe(0);
    expect(
      facingsOf(
        view({
          troops: [troop('infantry', point(METZ))],
          camps: [camp('boat', east(30), { medium: 'sea' })],
        }),
      ).get(pileId(METZ)),
    ).toBeCloseTo(90, 0);
  });

  it('leaves a marching column and the garrisons alone, a column that joined takes the pile’s', () => {
    const marching = troop('infantry', point(METZ));
    const joined = troop('armor', point(east(30)));
    const facings = facingsOf(
      view({
        troops: [
          marching,
          joined,
          troop('infantry', { kind: 'outpost', outpostId: 'o1' }),
          troop('infantry', { kind: 'building', buildingId: 'b1' }),
        ],
        arcs: [{ state: 'mine', troopIds: [marching.id] }],
        outposts: [{ id: 'o1', lonLat: east(20) }],
        buildings: [{ id: 'b1', key: 'barracks', point: east(20) }],
        camps: [camp('c', east(50))],
      }),
    );
    expect([...facings.keys()]).toEqual([pileId(east(30))]);
  });

  it('reads the range off the theatre in a Blitz', () => {
    const tokyo: LonLat = [139.7, 35.7];
    const at: LonLat = [tokyo[0] + 150 / 90, tokyo[1]];
    const blitz = (theatre: string | null) =>
      ({
        ...view({ troops: [troop('infantry', point(tokyo))], camps: [camp('c', at)] }),
        mode: theatre === null ? 'mondiale' : 'blitz',
        theatre,
      }) as PlayerView;
    expect(facingsOf(blitz(null)).size).toBe(0);
    expect(facingsOf(blitz('pacific')).size).toBe(1);
  });

  it('says the same camps as contactsOf: a pile is turned exactly when it is ringed', () => {
    const v = view({
      troops: [troop('infantry', point(METZ)), troop('infantry', point(east(500)))],
      camps: [camp('c', east(40))],
    });
    const ringed = contactsOf(v, cities).flatMap(({ pinIds }) => pinIds);
    expect(ringed).toContain(pileId(METZ));
    expect(ringed).not.toContain(pileId(east(500)));
    expect([...facingsOf(v).keys()]).toEqual([pileId(METZ)]);
  });
});
