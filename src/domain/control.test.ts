import { describe, expect, it } from 'vitest';
import { heldRegions, seatInk, SEAT_INKS, type ControlledRegion } from './control';
import type { LonLat } from './geo';

const REACH_KM = 400;

/** Sur l'équateur, un degré de longitude vaut ~111 km : les distances de ces cas se lisent. */
const at = (lon: number): LonLat => [lon, 0];

const region = (id: string, lon: number, country = 'ROU'): ControlledRegion => ({
  id,
  country,
  point: at(lon),
});

const held = (
  regions: ReadonlyArray<ControlledRegion>,
  outposts: ReadonlyArray<{ owner: string; point: LonLat }>,
  homeGrounds: ReadonlyArray<{ owner: string; country: string }> = [],
) => heldRegions({ regions, outposts, homeGrounds, reachKm: REACH_KM });

describe('the colour follows the outpost', () => {
  it('holds a region whose point falls inside the reach', () => {
    const map = held([region('near', 1)], [{ owner: 'pierre', point: at(0) }]);
    expect(map.get('near')).toBe('pierre');
  });

  it('leaves a region beyond the reach to nobody', () => {
    // Ten degrees out on the equator: well past the four hundred kilometres.
    const map = held([region('far', 10)], [{ owner: 'pierre', point: at(0) }]);
    expect(map.has('far')).toBe(false);
    expect(map.size).toBe(0);
  });

  it('holds nothing at all without an outpost', () => {
    expect(held([region('anywhere', 0)], []).size).toBe(0);
  });
});

describe('a disputed region goes to the nearest', () => {
  it('gives it to the closer outpost, whatever the order they arrive in', () => {
    const outposts = [
      { owner: 'lea', point: at(2) },
      { owner: 'pierre', point: at(0) },
    ];
    expect(held([region('between', 0.5)], outposts).get('between')).toBe('pierre');
    expect(held([region('between', 1.5)], outposts).get('between')).toBe('lea');
    // The same list read backwards answers the same: the rule is the distance, not the order.
    expect(held([region('between', 0.5)], [...outposts].reverse()).get('between')).toBe('pierre');
  });

  /** Un départage arbitraire — l'ordre d'insertion, le nom du joueur — serait une règle que rien
   *  n'énonce et qu'aucun joueur ne pourrait lire sur la carte. */
  it('leaves an exact tie to nobody', () => {
    const map = held(
      [region('middle', 1)],
      [
        { owner: 'pierre', point: at(0) },
        { owner: 'lea', point: at(2) },
      ],
    );
    expect(map.has('middle')).toBe(false);
  });

  it('is not a dispute when both outposts are the same player’s', () => {
    const map = held(
      [region('middle', 1)],
      [
        { owner: 'pierre', point: at(0) },
        { owner: 'pierre', point: at(2) },
      ],
    );
    expect(map.get('middle')).toBe('pierre');
  });
});

describe('the home ground outranks any outpost', () => {
  /** Poser un avant-poste chez quelqu'un donne le droit d'y bâtir, jamais celui d'y tenir le
   *  sol : une nation n'est jamais annexée (ADR 0004). */
  it('keeps a national region to its nation under an enemy outpost', () => {
    const map = held(
      [region('paris', 0, 'FRA')],
      [{ owner: 'lea', point: at(0) }],
      [{ owner: 'pierre', country: 'FRA' }],
    );
    expect(map.get('paris')).toBe('pierre');
  });

  it('colours the whole home country from the launch, outpost or not', () => {
    const map = held(
      [region('paris', 0, 'FRA'), region('nice', 5, 'FRA')],
      [],
      [{ owner: 'pierre', country: 'FRA' }],
    );
    expect([...map.values()]).toEqual(['pierre', 'pierre']);
  });

  it('leaves a nation nobody plays to the outposts', () => {
    const map = held([region('bucarest', 0, 'ROU')], [{ owner: 'lea', point: at(0) }], []);
    expect(map.get('bucarest')).toBe('lea');
  });
});

describe('the seat inks', () => {
  it('gives the eight seats eight distinct inks', () => {
    expect(new Set(SEAT_INKS).size).toBe(8);
    expect(SEAT_INKS.every((ink) => /^#[0-9a-f]{6}$/.test(ink))).toBe(true);
  });

  it('answers an ink for every rank, the ninth included', () => {
    expect(seatInk(0)).toBe(SEAT_INKS[0]);
    expect(seatInk(7)).toBe(SEAT_INKS[7]);
    expect(seatInk(8)).toBe(SEAT_INKS[0]);
  });
});
