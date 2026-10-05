// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { TroopView } from '@/domain/player-view';
import { TroopBadge } from './TroopBadge';

/**
 * **Sous le seuil, la fiche d'une troupe se réduit sans la désélectionner** (décision 3a), et
 * porte le refus que la rose ne s'ouvre plus pour dire au doigt (décision 2a).
 */
beforeEach(() =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);
afterEach(cleanup);

/** Un toucher entier : l'appui, le relâché sur place, puis le clic que le navigateur en tire. */
function tap(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 }));
    target.click();
  });
}

const cargoShip: TroopView = {
  id: 'c-1',
  role: 'cargo',
  tier: 1,
  strength: 50,
  nominalStrength: 50,
  stationedAt: { kind: 'point', lonLat: [2, 49] },
  supplied: true,
} as unknown as TroopView;

const MOTIVE = 'un cargo ne fonde pas';

const mount = (motive: string | null = null) => {
  const onClose = vi.fn();
  render(
    <TroopBadge
      nation="france"
      where="Oise"
      troops={[cargoShip]}
      at={{ x: 0, y: 0 }}
      aiming
      motive={motive}
      cargo={[]}
      onOpenGunnery={() => {}}
      onClose={onClose}
    />,
  );
  return onClose;
};

function swipeDown(): void {
  const grip = screen.getByRole('dialog').firstElementChild!;
  act(() => {
    grip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 420 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 420 }));
  });
}

describe('the troop sheet on a phone', () => {
  it('collapses without deselecting, the aim still armed', () => {
    const onClose = mount();
    swipeDown();
    expect(screen.getByRole('dialog').dataset.height).toBe('collapsed');
    expect(onClose).not.toHaveBeenCalled();

    tap(screen.getByRole('heading'));
    expect(screen.getByText(fr.aimSheet.pick)).toBeTruthy();
  });

  it('reads the motive the rose withheld, and only then', () => {
    mount(MOTIVE);
    expect(screen.getByText(MOTIVE)).toBeTruthy();
    cleanup();
    mount(null);
    expect(screen.queryByText(MOTIVE)).toBeNull();
  });
});
