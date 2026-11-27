import { describe, expect, it } from 'vitest';
import { nextActionsOf } from './next-actions';
import { chipsOf, stepChipOf } from './todo-chips';
import type { PlayerView, TroopView } from './player-view';

const view = (over: Partial<PlayerView['me']> = {}): PlayerView =>
  ({
    arcs: [],
    captures: [],
    loadedAt: 0,
    season: { outcome: { concludedAt: null } },
    me: {
      homePosition: [2, 47],
      hqLevel: 1,
      foundation: [],
      construction: { id: 'W-1', outpostId: null },
      constructionQueue: [],
      resources: {},
      buildings: [],
      recruiting: [],
      regions: [],
      outposts: [],
      slots: { total: 2, used: 2 },
      troops: [],
      ...over,
    },
  }) as unknown as PlayerView;

const stack = (id: string, lon: number, supplied = true): TroopView =>
  ({
    id,
    role: 'infantry',
    strength: 50,
    nominalStrength: 50,
    supplied,
    stationedAt: {
      kind: 'point',
      lonLat: [lon, 45],
      country: 'CAN',
      afloat: false,
      coastal: false,
    },
  }) as unknown as TroopView;

const chips = (over: Partial<PlayerView['me']>) => chipsOf(nextActionsOf(view(over)));

describe('a chip', () => {
  it('counts the troops, not the places, and walks through the places', () => {
    const [chip] = chips({ troops: [stack('a', -10), stack('b', -10), stack('c', -20)] });
    expect(chip).toMatchObject({ id: 'troopWithoutOrder', count: 3, targets: 2 });
    expect(chip?.word).toBe('troupes sans ordre');
  });

  it('says one troop in the singular, and counts those out of supply apart', () => {
    const found = chips({ troops: [stack('a', -10, false)] });
    expect(found.map((chip) => [chip.id, chip.count, chip.word])).toEqual([
      ['troopWithoutOrder', 1, 'troupe sans ordre'],
      ['unsupplied', 1, 'troupe hors ravitaillement'],
    ]);
  });

  it('carries one chip for each line the list carries, in its order, and none when nothing waits', () => {
    const troops = [stack('a', -10, false)];
    expect(chips({ troops }).map((chip) => chip.id)).toEqual(
      nextActionsOf(view({ troops })).map((action) => action.id),
    );
    expect(chips({})).toEqual([]);
  });

  it('counts the placements owed, and unfolds the list instead of leading away', () => {
    const [chip] = chips({
      construction: null,
      foundation: [{ key: 'farm' }, { key: 'mine' }, { key: 'mine' }] as never,
    });
    expect(chip).toMatchObject({ id: 'foundation', count: 3, unfolds: true });
  });

  it('counts an idle site as the one it is', () => {
    expect(chips({ construction: null }).find((chip) => chip.id === 'idleSite')).toMatchObject({
      count: 1,
      word: 'chantier libre',
    });
  });

  it('marks only the line already critical as an alert', () => {
    const alert = chipsOf([
      {
        id: 'siteUnderCapture',
        kind: 'siteUnderCapture',
        label: '',
        count: 2,
        targets: [{ kind: 'map', point: [0, 0] }],
      },
    ]);
    expect(alert[0]?.alert).toBe(true);
    expect(chips({ troops: [stack('a', -10, false)] }).some((chip) => chip.alert)).toBe(false);
  });
});

describe('the first steps chip', () => {
  it('carries the steps done, out of all of them, and the short word of the lit step', () => {
    expect(stepChipOf(['hq', 'move'], 'harvest', false)).toEqual({
      progress: '2 / 6',
      word: 'Bâtir une ferme',
      title: expect.stringContaining('Bâtir une ferme'),
    });
  });

  it('asks for the outpost first while none is held', () => {
    expect(stepChipOf([], 'deliver', true).word).toBe('Fonder un avant-poste');
    expect(stepChipOf([], 'deliver', false).word).toBe('Livrer un camion');
  });
});
