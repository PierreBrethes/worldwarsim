import { describe, expect, it } from 'vitest';
import type { CompassAction } from '@/domain/compass-rose';
import { fitShift, readsFirst } from './CompassRose';

/**
 * **La rose ne sort jamais de l'écran** (lot mobile-3, §1). Au relevé du 03/10, trois libellés
 * sortaient de 18 px sur un iPhone 13 ; le recalage pousse la carte du strict nécessaire, et
 * réserve au pied la place de la feuille à l'aperçu qui s'ouvre avec elle.
 */
const frame = { left: 0, top: 100, right: 390, bottom: 600 };

describe('fitShift', () => {
  it('ne bouge rien quand la rose tient', () => {
    expect(fitShift({ left: 100, top: 200, right: 300, bottom: 400 }, frame)).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it('pousse la carte vers la gauche quand un libellé sort à droite', () => {
    expect(fitShift({ left: 220, top: 200, right: 408, bottom: 400 }, frame, 10)).toEqual({
      dx: -28,
      dy: 0,
    });
  });

  it('pousse vers le bas sous le bandeau, vers le haut au-dessus de la feuille', () => {
    expect(fitShift({ left: 100, top: 80, right: 300, bottom: 280 }, frame, 10).dy).toBe(30);
    expect(fitShift({ left: 100, top: 420, right: 300, bottom: 620 }, frame, 10).dy).toBe(-30);
  });

  it('centre une rose plus grande que le cadre plutôt que de sacrifier un bord', () => {
    expect(fitShift({ left: -50, top: 200, right: 450, bottom: 400 }, frame, 10).dx).toBe(-5);
  });
});

const action = (key: CompassAction['key'], hold: unknown = null): CompassAction =>
  ({ key, hold }) as unknown as CompassAction;

/**
 * **Ce qui paie sans carte de confirmation se touche deux fois** (sous le seuil) : élever, monter
 * un point, fonder partent au serveur dès l'action, et leur facture n'est
 * écrite que dans la bulle. Le premier toucher la lit, le second agit.
 */
describe('readsFirst', () => {
  it.each(['upgrade', 'raiseOutpost', 'found'] as const)(
    'fait lire %s au premier toucher, sous le seuil',
    (key) => {
      expect(readsFirst(action(key), true)).toBe(true);
    },
  );

  /** Viser, piller, ramasser ouvrent un aperçu qui confirme ; raser et
   *  démanteler leur carte : un second toucher n'y protégerait rien. */
  it.each(['aim', 'plunder', 'collect', 'demolish', 'dismantle'] as const)(
    'laisse %s agir au premier toucher, sous le seuil',
    (key) => {
      expect(readsFirst(action(key), true)).toBe(false);
    },
  );

  it('fait toujours lire une branche retenue : elle n’a que sa raison à donner', () => {
    expect(readsFirst(action('upgrade', { reason: 'stock' }), true)).toBe(true);
  });

  it('fait toujours lire au-dessus du seuil, où le pictogramme est muet', () => {
    expect(readsFirst(action('aim'), false)).toBe(true);
  });
});
