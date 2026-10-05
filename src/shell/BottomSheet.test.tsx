// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { BottomSheet } from './BottomSheet';
import { SoleSurfaceProvider } from './sole-surface';

/**
 * **La feuille basse : trois hauteurs, une poignée, une seule surface ouverte** (piste A, passe 2).
 * jsdom ne met rien en page : ce qui se vérifie est le cran que la feuille déclare
 * (`data-height`, que la feuille de style traduit en hauteur) et qui ferme qui.
 *
 * Le glisser est donné en événements souris nommés comme ceux du pointeur : jsdom n'a pas de
 * `PointerEvent`, et la feuille ne lit que `clientY` et `button`.
 */
afterEach(cleanup);

/** Un toucher entier : l'appui, le relâché sur place, puis le clic que le navigateur en tire. */
function tap(target: HTMLElement): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 }));
    target.click();
  });
}

const sheet = (): HTMLElement => screen.getByRole('dialog');

function swipe(travel: number): void {
  const grip = sheet().firstElementChild!;
  act(() => {
    grip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 + travel }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 + travel }));
  });
}

describe('the bottom sheet', () => {
  it('opens at half height, climbs to full and steps down to a peek', () => {
    render(
      <BottomSheet title="Calques de la carte" onClose={() => {}}>
        <p>huit bascules</p>
      </BottomSheet>,
    );
    expect(sheet().dataset.height).toBe('half');

    swipe(-120);
    expect(sheet().dataset.height).toBe('full');
    swipe(120);
    swipe(120);
    expect(sheet().dataset.height).toBe('peek');
  });

  it('closes on a swipe down from its lowest step, and on its button', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="À faire" onClose={onClose} initial="peek">
        <p>une ligne</p>
      </BottomSheet>,
    );

    swipe(120);
    expect(onClose).toHaveBeenCalledTimes(1);

    screen.getByRole('button', { name: fr.common.close }).click();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ignores a touch that only trembled', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="À faire" onClose={onClose} initial="peek">
        <p>une ligne</p>
      </BottomSheet>,
    );
    swipe(12);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet().dataset.height).toBe('peek');
  });

  /** **La feuille d'une sélection se réduit, elle ne se ferme pas au glisser** (décision 3a). */
  describe('when it carries a selection', () => {
    const mount = () => {
      const onClose = vi.fn();
      render(
        <BottomSheet title="Infanterie" onClose={onClose} initial="peek" keepsSelection>
          <p>la fiche</p>
        </BottomSheet>,
      );
      return onClose;
    };

    it('collapses to its header from the peek, and goes no lower', () => {
      const onClose = mount();
      swipe(120);
      expect(sheet().dataset.height).toBe('collapsed');
      expect(screen.getByText('la fiche').parentElement!.hidden).toBe(true);

      swipe(120);
      expect(sheet().dataset.height).toBe('collapsed');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('comes back to the peek on a swipe up or a touch on its header', () => {
      mount();
      swipe(120);
      swipe(-120);
      expect(sheet().dataset.height).toBe('peek');

      swipe(120);
      tap(screen.getByRole('heading'));
      expect(sheet().dataset.height).toBe('peek');
      expect(screen.getByText('la fiche').parentElement!.hidden).toBe(false);
    });

    it('still closes on its button, collapsed or not', () => {
      const onClose = mount();
      swipe(120);
      act(() => screen.getByRole('button', { name: fr.common.close }).click());
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(sheet().dataset.height).toBe('collapsed');
    });

    it('climbs past the peek as any sheet does', () => {
      mount();
      swipe(-120);
      expect(sheet().dataset.height).toBe('half');
    });
  });

  /** Ce que le joueur ouvre en dernier reste seul : la précédente se ferme par son propre geste. */
  it('closes the surface that was open when another one opens', () => {
    function Board() {
      const [open, setOpen] = useState<ReadonlyArray<string>>(['à faire']);
      return (
        <SoleSurfaceProvider>
          <button type="button" onClick={() => setOpen((shown) => [...shown, 'calques'])}>
            ouvrir les calques
          </button>
          {open.map((title) => (
            <BottomSheet
              key={title}
              title={title}
              onClose={() => setOpen((shown) => shown.filter((other) => other !== title))}
            >
              <p>{title}</p>
            </BottomSheet>
          ))}
        </SoleSurfaceProvider>
      );
    }

    render(<Board />);
    expect(screen.getAllByRole('dialog').map((open) => open.getAttribute('aria-label'))).toEqual([
      'à faire',
    ]);

    act(() => screen.getByRole('button', { name: 'ouvrir les calques' }).click());
    expect(screen.getAllByRole('dialog').map((open) => open.getAttribute('aria-label'))).toEqual([
      'calques',
    ]);
  });
});
