import { describe, expect, it } from 'vitest';
import { fr } from './fr';
import { HQ_LEVEL_AT_LAUNCH, MAX_HQ_LEVEL, buildingCap } from '../../convex/constants';
import { capReliefOf } from '../../convex/constructions';

/**
 * **Le plafond dit son remède, chiffré** (décision du 25/08). « Montez le quartier général »
 * est un conseil ; « un quartier général niveau 2 le porte à 8 » est un plan, et c'est la règle
 * du grisé appliquée au plafond (ADR 0015, révision du 24/08 — rien d'affiché sans sa
 * condition).
 *
 * Ce qui est sous test ici n'est pas la phrase mais **d'où viennent ses nombres** : de
 * `buildingCap`, une seule fois, servis au client. Un chiffre recopié dans `fr.ts` mentirait le
 * jour où l'échelle bouge, et c'est exactement ce que ce fichier attrape.
 */
describe('the ceiling names its remedy', () => {
  it('reads the ladder of buildingCap, never a copy of it', () => {
    for (let hqLevel = 0; hqLevel < MAX_HQ_LEVEL; hqLevel += 1) {
      expect(capReliefOf(hqLevel)).toEqual({
        nextHqLevel: hqLevel + 1,
        nextCap: buildingCap(hqLevel + 1),
      });
    }
  });

  /** At the top of the ladder there is nothing left to raise, and a sentence promising
   *  otherwise would send the player climbing a step that does not exist. */
  it('offers no remedy at the top of the ladder', () => {
    expect(capReliefOf(MAX_HQ_LEVEL)).toBeNull();
  });

  /** The two sentences a player can meet — the refusal after a click and the line in the
   *  window — carry the same two numbers, because they read the same served relief. */
  it('says the same figures in the refusal and in the budget line', () => {
    const relief = capReliefOf(HQ_LEVEL_AT_LAUNCH)!;
    const cap = buildingCap(HQ_LEVEL_AT_LAUNCH);

    const refused = fr.errors.BUILDING_CAP_REACHED({
      code: 'BUILDING_CAP_REACHED',
      cap,
      hqLevel: HQ_LEVEL_AT_LAUNCH,
      ...relief,
    });
    expect(refused).toContain(String(cap));
    expect(refused).toContain(String(relief.nextHqLevel));
    expect(refused).toContain(String(relief.nextCap));

    const held = fr.construction.heldByCap(cap, relief);
    expect(held).toContain(String(relief.nextCap));
    expect(fr.economy.budgetRelief(relief)).toContain(String(relief.nextCap));
  });

  /** A deployment that serves no relief — or a headquarters at the top — must still say
   *  something true rather than print a hole. */
  it('falls back on a sentence without figures when there is no relief to name', () => {
    const said = fr.errors.BUILDING_CAP_REACHED({ code: 'BUILDING_CAP_REACHED', cap: 14 });
    expect(said).toContain('14');
    expect(said).toContain('maximum');
    // The tell of a missing figure: `num` prints an em dash where a number should be, and a
    // sentence promising a level nobody can reach is worse than one promising nothing.
    expect(said).not.toContain('niveau');
  });
});
