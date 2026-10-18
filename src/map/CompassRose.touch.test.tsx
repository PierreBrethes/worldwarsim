// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Compass, CompassAction } from '@/domain/compass-rose';
import { CompassRose, readsFirst } from './CompassRose';

/**
 * **Sous le seuil, deux touchers pour ce qui paie sans confirmation, un seul pour le reste.**
 * Élever, monter un point, fonder et changer de métier partent au serveur dès l'action : le
 * premier toucher montre la bulle, le second agit, un toucher ailleurs annule. Viser, piller,
 * ramasser, bâtir, raser et démanteler ouvrent une surface qui confirme — un seul toucher.
 *
 * jsdom n'a pas de `PointerEvent` : le type du pointeur est posé à la main sur l'événement, la
 * rose ne lit que lui.
 */
afterEach(cleanup);

const upgrade = {
  key: 'upgrade',
  pictogram: 'chevron',
  label: 'élever au niveau 2',
  cost: null,
  consequence: 'le rayon suivant',
  buildingKey: 'mine',
  regionId: 'FRA-5333',
  figure: '40 alliage',
  bill: [{ text: '40 alliage · 120 en stock', lacking: false }],
  duration: '00:30:00',
  hold: null,
} as unknown as CompassAction;

const aim = {
  key: 'aim',
  pictogram: 'cabin',
  label: 'marche',
  cost: null,
  consequence: 'la colonne y marche',
  type: 'march',
  aim: { kind: 'point', lon: 2, lat: 48 },
} as unknown as CompassAction;

const of = (key: CompassAction['key']): CompassAction =>
  ({ ...upgrade, key, hold: null, current: false, sealed: null }) as unknown as CompassAction;

describe('readsFirst', () => {
  it('fait lire d’abord, sous le seuil, les quatre branches qui paient sans confirmation', () => {
    for (const key of ['upgrade', 'raiseOutpost', 'found', 'specialize'] as const)
      expect(readsFirst(of(key), true)).toBe(true);
  });

  it('laisse agir au premier toucher, sous le seuil, celles qui ouvrent leur confirmation', () => {
    for (const key of ['aim', 'plunder', 'collect', 'build', 'demolish', 'dismantle'] as const)
      expect(readsFirst(of(key), true)).toBe(false);
  });

  it('fait toujours lire une branche retenue, et tout au-dessus du seuil', () => {
    const held = { ...upgrade, hold: { reason: 'matière', availability: null } } as CompassAction;
    expect(readsFirst(held, true)).toBe(true);
    expect(readsFirst(aim, false)).toBe(true);
  });
});

function touch(element: Element): void {
  const down = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
  Object.defineProperty(down, 'pointerType', { value: 'touch' });
  act(() => {
    element.dispatchEvent(down);
    (element as HTMLElement).click();
  });
}

function rose(actions: ReadonlyArray<CompassAction>) {
  const onAction = vi.fn();
  const onClose = vi.fn();
  const compass = { kicker: 'région', name: 'Marne', actions, refusal: null } as Compass;
  render(
    <CompassRose
      compass={compass}
      x={200}
      y={300}
      width={390}
      height={600}
      onClose={onClose}
      onAction={onAction}
      finger={{ floor: 0, onFit: () => {} }}
    />,
  );
  return { onAction, onClose };
}

describe('la rose sous le doigt', () => {
  it('montre la facture au premier toucher sur « élever », et agit au second', () => {
    const { onAction } = rose([upgrade, aim]);
    const medallion = screen.getByRole('button', { name: 'élever au niveau 2' });
    touch(medallion);
    expect(onAction).not.toHaveBeenCalled();
    expect(document.querySelector('.rose-bubble')?.textContent).toContain('40 alliage');
    touch(medallion);
    expect(onAction).toHaveBeenCalledExactlyOnceWith(upgrade);
  });

  it('agit au premier toucher sur « marche »', () => {
    const { onAction } = rose([upgrade, aim]);
    touch(screen.getByRole('button', { name: 'marche' }));
    expect(onAction).toHaveBeenCalledExactlyOnceWith(aim);
  });

  it('annule au toucher ailleurs : la rose se referme sans rien envoyer', () => {
    const { onAction, onClose } = rose([upgrade, aim]);
    touch(screen.getByRole('button', { name: 'élever au niveau 2' }));
    touch(document.body);
    expect(onClose).toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });
});
