import { describe, expect, it } from 'vitest';
import { COST_BY_ROLE, TIER_2_FACTOR, buildCost } from '../../convex/constants';
import { rankedByTerritory, scoresOf, type AlloyPrices } from './standings';
import type { BuildingKey, UnitRole } from './ids';

/**
 * **Les prix sont importés, jamais recopiés** — c'est la leçon de `verif-chiffrage.mjs`, qui
 * validait le chiffrage sur une copie. Le test lit `buildCost` et `COST_BY_ROLE` comme la
 * production, et il tomberait si le barème se mettait à recopier une table à lui.
 */
const ALLOY: AlloyPrices = {
  ofLevel: (key, level) => buildCost(key as BuildingKey, level).alloy ?? 0,
  ofTroop: (role, tier) => COST_BY_ROLE[role as UnitRole].alloy * (tier === 2 ? TIER_2_FACTOR : 1),
};

const scores = (input: Partial<Parameters<typeof scoresOf>[0]>) =>
  scoresOf({
    buildings: [],
    troops: [],
    engagements: 0,
    heldCount: 0,
    heldByAnyone: 0,
    alloy: ALLOY,
    ...input,
  });

describe('industry', () => {
  it('sums every level climbed, not the price of the last one', () => {
    const hq = { key: 'hq', level: 2, disabled: false };
    const mine = { key: 'mine', level: 1, disabled: false };
    expect(scores({ buildings: [hq, mine] }).industry).toBe(
      (buildCost('hq', 1).alloy ?? 0) +
        (buildCost('hq', 2).alloy ?? 0) +
        (buildCost('mine', 1).alloy ?? 0),
    );
  });

  /** L'annexe du contrat de vue 07 chiffre la France de la maquette à 393 : le barème doit
   *  tomber dessus, sans quoi la planche validée montre un nombre que le jeu ne produit pas. */
  it('matches the mock-up’s own French nation, to the alloy', () => {
    const standing: ReadonlyArray<[BuildingKey, number]> = [
      ['hq', 2],
      ['mine', 1],
      ['farm', 1],
      ['foundry', 1],
      ['barracks', 1],
      ['port', 1],
      ['mill', 1],
    ];
    const buildings = standing.map(([key, level]) => ({ key, level, disabled: false }));
    expect(scores({ buildings }).industry).toBe(393);
  });

  /** Un avant-poste désactivé par un raid éteint ce qui pend à lui — tant qu'il l'est, et pas
   *  une minute de plus : rien n'est détruit, donc rien n'est décrémenté (ADR 0020 §7). */
  it('counts a disabled building at zero', () => {
    const buildings = [
      { key: 'mine', level: 1, disabled: true },
      { key: 'farm', level: 1, disabled: false },
    ];
    expect(scores({ buildings }).industry).toBe(buildCost('farm', 1).alloy);
  });
});

describe('military', () => {
  it('prices a troop at its full alloy times its share of hit points', () => {
    const halved = { role: 'infantry', tier: 1, strength: 25, nominalStrength: 50 };
    expect(scores({ troops: [halved] }).military).toBe(Math.round(18 * 0.5));
  });

  it('carries the mark-2 factor', () => {
    const armor = { role: 'armor', tier: 2, strength: 6, nominalStrength: 6 };
    expect(scores({ troops: [armor] }).military).toBe(Math.round(95 * 1.6));
  });

  /** La somme s'arrondit **après** addition (spécification §1) : arrondir chaque troupe ferait
   *  dériver une armée de vingt pions de plusieurs points d'alliage. */
  it('rounds after the sum, never troop by troop', () => {
    const troops = [
      { role: 'infantry', tier: 1, strength: 50, nominalStrength: 50 },
      { role: 'infantry', tier: 1, strength: 50, nominalStrength: 50 },
      { role: 'infantry', tier: 1, strength: 32, nominalStrength: 50 },
      { role: 'cargo', tier: 1, strength: 8, nominalStrength: 8 },
    ];
    expect(scores({ troops }).military).toBe(168);
  });

  it('weighs a troop formed at nothing at nothing, rather than dividing by zero', () => {
    const ghost = { role: 'infantry', tier: 1, strength: 0, nominalStrength: 0 };
    expect(scores({ troops: [ghost] }).military).toBe(0);
  });
});

describe('territory', () => {
  /** Les parts somment à 100 : le dénominateur est ce que **quelqu'un** tient, jamais le
   *  planisphère (ADR 0020 §2). */
  it('is a share of what somebody holds, not of the world', () => {
    expect(scores({ heldCount: 14, heldByAnyone: 44 }).territory).toBeCloseTo(31.8, 1);
  });

  it('is zero while nobody holds anything, never a division by zero', () => {
    expect(scores({ heldCount: 0, heldByAnyone: 0 }).territory).toBe(0);
  });
});

describe('the general score', () => {
  /** Sans coefficient, et sans les faits d'armes : un compteur d'activité additionné à de
   *  l'alliage n'aurait pas d'unité (spécification §1). */
  it('is industry plus military, and nothing else', () => {
    const board = scores({
      buildings: [{ key: 'farm', level: 1, disabled: false }],
      troops: [{ role: 'infantry', tier: 1, strength: 50, nominalStrength: 50 }],
      engagements: 7,
      heldCount: 3,
      heldByAnyone: 4,
    });
    expect(board.general).toBe(board.industry + board.military);
    expect(board.deeds).toBe(7);
  });
});

describe('the order of the page', () => {
  it('ranks by territory, the first at the top', () => {
    const ranked = rankedByTerritory([
      { name: 'Japon', territory: 20.5 },
      { name: 'Allemagne', territory: 47.7 },
      { name: 'France', territory: 31.8 },
    ]);
    expect(ranked.map((line) => [line.rank, line.name])).toEqual([
      [1, 'Allemagne'],
      [2, 'France'],
      [3, 'Japon'],
    ]);
  });
});
