import { describe, expect, it } from 'vitest';
import { distanceNotesOf, dropRefusalOf } from './useOrderPreview';
import type { OrderChoice, Previewed } from './order-wire';

const choice = (lon: number, extra: Partial<OrderChoice> = {}): OrderChoice => ({
  aim: { kind: 'point', lon, lat: 50, ground: 'land', surveyed: true, coastal: false },
  type: 'march',
  label: 'Marcher',
  consequence: '',
  mission: { kind: 'march' },
  ...extra,
});
const preview = (short: { needed: number; held: number; role: string } | null) =>
  ({ fuel: { short, km: 685 } }) as unknown as Previewed;

describe('what letting go refuses before the server is asked (#258)', () => {
  it('says the short fuel when the preview refuses the very order let go', () => {
    const seen = { choice: choice(8), preview: preview({ needed: 2, held: 1, role: 'armor' }) };
    expect(dropRefusalOf(seen, choice(8))).toContain('685');
  });

  it('lets go when nothing was seen, or another aim, type or mission was', () => {
    const seen = { choice: choice(8), preview: preview({ needed: 2, held: 1, role: 'armor' }) };
    expect(dropRefusalOf(undefined, choice(8))).toBeNull();
    expect(dropRefusalOf(seen, choice(9))).toBeNull();
    expect(dropRefusalOf(seen, choice(8, { type: 'attack' }))).toBeNull();
    expect(
      dropRefusalOf(seen, choice(8, { mission: { kind: 'march', roundTrip: true } })),
    ).toBeNull();
  });

  it('lets a valid road go, and a missing one too: the server says its exact reason', () => {
    expect(dropRefusalOf({ choice: choice(8), preview: preview(null) }, choice(8))).toBeNull();
    expect(dropRefusalOf({ choice: choice(8), preview: null }, choice(8))).toBeNull();
  });
});

describe('the length of the road, said under the hand (#302)', () => {
  const alone = { grouped: false, blitz: false };
  const road = (land: number, sea: number, minutes: number, fuelKm = 0) =>
    ({
      minutes,
      /** What the server's fuel bill counts on the same road, round trip aside. */
      fuel: { km: fuelKm },
      route: {
        distanceUnits: land + sea,
        legs: [
          ...(land > 0 ? [{ medium: 'land', distanceUnits: land }] : []),
          ...(sea > 0 ? [{ medium: 'sea', distanceUnits: sea }] : []),
        ],
      },
    }) as unknown as NonNullable<Previewed>;
  const said = (preview: NonNullable<Previewed>, on = alone) =>
    distanceNotesOf(preview, on).map((n) => n.text);

  it('writes the kilometres the server counts for its fuel, and the time', () => {
    const preview = road(5.77, 0, 200, 640);
    expect(said(preview)).toEqual(['≈ 640 km · 3 h 20']);
    expect(said(preview)[0]).toContain(`${preview.fuel.km} km`);
  });

  it('adds the share of the sea when land and sea share the road', () => {
    expect(said(road(3.7, 2.07, 200))).toEqual(['≈ 640 km · 3 h 20', 'dont 230 km de mer']);
  });

  it('does not repeat the total as a share when the whole road is at sea', () => {
    expect(said(road(0, 2.6, 130))).toEqual(['≈ 289 km · 2 h 10']);
  });

  /** **Le chip dit pourquoi la durée est courte** (ADR 0037 §8) : ce que les liaisons ont pris. */
  it('says what the liaisons took off the road, and nothing when they took nothing', () => {
    const fast = { ...road(5.77, 0, 200, 640), relayed: 40 } as NonNullable<Previewed>;
    expect(said(fast)).toEqual([
      '≈ 640 km · 3 h 20',
      '×1,5 dans le rayon de vos liaisons — 40 min de gagné',
    ]);
    expect(said({ ...fast, relayed: 0 } as NonNullable<Previewed>)).toEqual(['≈ 640 km · 3 h 20']);
  });

  it('says nothing for a grouped order: the line would hold for the pile in hand only', () => {
    expect(said(road(5.77, 0, 200), { grouped: true, blitz: false })).toEqual([]);
  });

  it('says nothing in a blitz, which reads its distances as a share of the theatre', () => {
    expect(said(road(5.77, 0, 200), { grouped: false, blitz: true })).toEqual([]);
  });
});
