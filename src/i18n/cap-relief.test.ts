import { describe, expect, it } from 'vitest';
import { fr } from './fr';
import { SEASON_FORMATS, buildingCap } from '../../convex/constants';
import { capReliefOf } from '../../convex/constructions';
import type { SeasonFormat } from '@/domain/ids';

/**
 * **Le plafond dit son remède, chiffré** (décision du 25/08). « Montez le quartier général »
 * est un conseil ; « un quartier général niveau 2 le porte à 8 » est un plan, et c'est la règle
 * du grisé appliquée au plafond (ADR 0015, révision du 24/08 — rien d'affiché sans sa
 * condition).
 *
 * Ce qui est sous test ici n'est pas la phrase mais **d'où viennent ses nombres** : de
 * `buildingCap`, une seule fois, servis au client. Un chiffre recopié dans `fr.ts` mentirait le
 * jour où l'échelle d'un format bouge, et c'est exactement ce que ce fichier attrape.
 */
const formats = () => Object.keys(SEASON_FORMATS) as ReadonlyArray<SeasonFormat>;

describe('the ceiling names its remedy', () => {
  it('reads the ladder of buildingCap, never a copy of it', () => {
    for (const format of formats()) {
      const spec = SEASON_FORMATS[format];
      for (let hqLevel = 0; hqLevel < spec.maxHqLevel; hqLevel += 1) {
        const relief = capReliefOf(format, hqLevel);
        expect(relief).toEqual({
          nextHqLevel: hqLevel + 1,
          nextCap: buildingCap(format, hqLevel + 1),
        });
      }
    }
  });

  /** At the top of a format's ladder there is nothing left to raise, and a sentence promising
   *  otherwise would send the player climbing a step that does not exist. */
  it('offers no remedy at the top of the ladder', () => {
    for (const format of formats()) {
      expect(capReliefOf(format, SEASON_FORMATS[format].maxHqLevel)).toBeNull();
    }
  });

  /** The two sentences a player can meet — the refusal after a click and the line in the
   *  window — carry the same two numbers, because they read the same served relief. */
  it('says the same figures in the refusal and in the budget line', () => {
    const relief = capReliefOf('skirmish', SEASON_FORMATS.skirmish.hqLevelAtLaunch)!;
    const cap = buildingCap('skirmish', SEASON_FORMATS.skirmish.hqLevelAtLaunch);

    const refused = fr.errors.BUILDING_CAP_REACHED({
      code: 'BUILDING_CAP_REACHED',
      cap,
      hqLevel: SEASON_FORMATS.skirmish.hqLevelAtLaunch,
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
