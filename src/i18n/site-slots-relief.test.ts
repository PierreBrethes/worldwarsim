import { describe, expect, it } from 'vitest';
import { fr } from './fr';
import { HQ_LEVEL_AT_LAUNCH, MAX_HQ_LEVEL, homeSlots } from '../../convex/constants';
import { homeSlotReliefOf } from '../../convex/constructions';

/**
 * **Le site plein dit son remède, chiffré** (décision du 25/08). « Montez le quartier général »
 * est un conseil ; « un quartier général niveau 2 les porte à 4 » est un plan, et c'est la règle
 * du grisé appliquée aux emplacements (ADR 0015, révision du 24/08 — rien d'affiché sans sa
 * condition).
 *
 * Ce qui est sous test ici n'est pas la phrase mais **d'où viennent ses nombres** : de
 * `homeSlots`, une seule fois, servis au client. Un chiffre recopié dans `fr.ts` mentirait le
 * jour où l'échelle bouge, et c'est exactement ce que ce fichier attrape.
 */
describe('a full national ground names its remedy', () => {
  it('reads the ladder of homeSlots, never a copy of it', () => {
    for (let hqLevel = 0; hqLevel < MAX_HQ_LEVEL; hqLevel += 1) {
      expect(homeSlotReliefOf(hqLevel)).toEqual({
        nextHqLevel: hqLevel + 1,
        nextSlots: homeSlots(hqLevel + 1),
      });
    }
  });

  /** At the top of the ladder there is nothing left to raise, and a sentence promising
   *  otherwise would send the player climbing a step that does not exist. */
  it('offers no remedy at the top of the ladder', () => {
    expect(homeSlotReliefOf(MAX_HQ_LEVEL)).toBeNull();
  });

  /** The two sentences a player can meet — the refusal after a click and the line in the
   *  window — carry the same two numbers, because they read the same served relief. */
  it('says the same figures in the refusal and in the budget line', () => {
    const relief = homeSlotReliefOf(HQ_LEVEL_AT_LAUNCH)!;
    const slots = homeSlots(HQ_LEVEL_AT_LAUNCH);

    const refused = fr.errors.SITE_SLOTS_FULL({
      code: 'SITE_SLOTS_FULL',
      site: 'home',
      taken: slots,
      slots,
      hqLevel: HQ_LEVEL_AT_LAUNCH,
      ...relief,
    });
    expect(refused).toContain(String(slots));
    expect(refused).toContain(String(relief.nextHqLevel));
    expect(refused).toContain(String(relief.nextSlots));

    const held = fr.construction.heldBySite(fr.construction.siteHome, slots, relief);
    expect(held).toContain(String(relief.nextSlots));
    expect(fr.economy.budgetRelief(relief)).toContain(String(relief.nextSlots));
  });

  /**
   * **Un avant-poste plein ne nomme pas le quartier général** : ce qui l'élargit est son propre
   * niveau, et renvoyer au QG serait un plan qui ne marche pas.
   */
  it('sends a full outpost to the outpost, never to the headquarters', () => {
    const said = fr.errors.SITE_SLOTS_FULL({
      code: 'SITE_SLOTS_FULL',
      site: 'outpost',
      taken: 1,
      slots: 1,
    });
    expect(said).toContain('avant-poste');
    expect(said).not.toContain('quartier général');
  });

  /** A deployment that serves no relief — or a headquarters at the top — must still say
   *  something true rather than print a hole. */
  it('falls back on a sentence without figures when there is no relief to name', () => {
    const said = fr.errors.SITE_SLOTS_FULL({
      code: 'SITE_SLOTS_FULL',
      site: 'home',
      taken: 14,
      slots: 14,
    });
    expect(said).toContain('14');
    expect(said).toContain('maximum');
    // The tell of a missing figure: `num` prints an em dash where a number should be, and a
    // sentence promising a level nobody can reach is worse than one promising nothing.
    expect(said).not.toContain('niveau');
  });
});
