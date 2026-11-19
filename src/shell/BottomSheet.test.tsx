// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { BottomSheet, FULL_SHARE_OF_ROOM, SelectionSheetReport, sheetHeight } from './BottomSheet';
import { SoleSurfaceProvider } from './sole-surface';

/**
 * **La feuille basse : trois hauteurs, une poignée, une seule surface ouverte** (piste A, passe 2).
 * jsdom ne met rien en page : ce qui se vérifie est le cran que la feuille déclare
 * (`data-height`, que la feuille de style traduit en hauteur) et qui ferme qui.
 *
 * Le glisser est donné en événements souris nommés comme ceux du pointeur : jsdom n'a pas de
 * `PointerEvent`, et la feuille ne lit que `clientY` et `button`.
 */
afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.motion;
  document.documentElement.style.removeProperty('--board-top');
  document.documentElement.style.removeProperty('--board-bottom');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  /** A swipe of `travel` px whose last moves take `ms` milliseconds (the clock is the sheet's own). */
  function flick(travel: number, ms: number): void {
    const grip = sheet().firstElementChild!;
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    act(() => {
      grip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }));
      now += ms / 2;
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 + travel / 2 }));
      now += ms / 2;
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 + travel }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 + travel }));
    });
    clock.mockRestore();
  }

  it('takes a short, fast flick for the next step, and a short slow drag for a tremble', () => {
    render(
      <BottomSheet title="Calques de la carte" onClose={() => {}}>
        <p>huit bascules</p>
      </BottomSheet>,
    );
    flick(-25, 400);
    expect(sheet().dataset.height).toBe('half');
    flick(-25, 60);
    expect(sheet().dataset.height).toBe('full');
    flick(25, 60);
    expect(sheet().dataset.height).toBe('half');
  });

  it('does not start a drag from the close button', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet title="À faire" onClose={onClose}>
        <p>une ligne</p>
      </BottomSheet>,
    );
    const button = screen.getByRole('button', { name: fr.common.close });
    act(() => {
      button.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }),
      );
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientY: 100 }));
    });
    expect(sheet().dataset.height).toBe('half');
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

  it('leaves a skylight of map above the top step: a share of what the band and bar leave', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    document.documentElement.style.setProperty('--board-top', '100px');
    document.documentElement.style.setProperty('--board-bottom', '80px');
    expect(sheetHeight('full')).toBeCloseTo(FULL_SHARE_OF_ROOM * (844 - 100 - 80));
    expect(sheetHeight('half')).toBe(422);
  });

  describe('at each animation setting', () => {
    const mountWithAnimate = () => {
      const animate = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'animate', {
        value: animate,
        configurable: true,
      });
      render(
        <BottomSheet title="Calques de la carte" onClose={() => {}}>
          <p>huit bascules</p>
        </BottomSheet>,
      );
      return animate;
    };
    afterEach(() => {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    });

    it('fades over 120 ms when reduced, and only when the step changes', () => {
      document.documentElement.dataset.motion = 'reduced';
      const animate = mountWithAnimate();
      swipe(12);
      expect(animate).not.toHaveBeenCalled();
      swipe(-120);
      expect(animate).toHaveBeenCalledWith({ opacity: [0.4, 1] }, { duration: 120 });
      expect(sheet().style.transform).toBe('');
    });

    it('settles without frame nor fade when off', () => {
      document.documentElement.dataset.motion = 'off';
      const raf = vi.spyOn(window, 'requestAnimationFrame');
      const animate = mountWithAnimate();
      swipe(-120);
      expect(sheet().dataset.height).toBe('full');
      expect(raf).not.toHaveBeenCalled();
      expect(animate).not.toHaveBeenCalled();
      expect(sheet().style.transform).toBe('');
    });
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

    it('does not reopen from the touch that follows a short, quick flick down', () => {
      mount();
      flick(25, 60);
      expect(sheet().dataset.height).toBe('collapsed');
      act(() =>
        sheet().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })),
      );
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

/**
 * **Au lâcher, la carte peut se recadrer** (#582) : la feuille d'une sélection dit le cran que le
 * doigt vient de choisir, mesuré — peek et half seulement, jamais full ni réduit, jamais un glisser
 * qui revient au même cran.
 */
describe('a selection sheet released on a step', () => {
  const HEIGHTS = { collapsed: 60, peek: 250, half: 420, full: 600 } as const;

  const mount = (initial: 'peek' | 'half') => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const height = HEIGHTS[this.dataset.height as keyof typeof HEIGHTS] ?? 0;
      return { height, top: 0, left: 0, width: 390, bottom: height, right: 390 } as DOMRect;
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    const stepped = vi.fn();
    render(
      <SelectionSheetReport.Provider value={{ report: () => {}, onStep: stepped }}>
        <BottomSheet title="Infanterie" onClose={() => {}} initial={initial} keepsSelection>
          <p>la fiche</p>
        </BottomSheet>
      </SelectionSheetReport.Provider>,
    );
    return stepped;
  };

  it('tells the measured height of the step it reaches, going up to half or down to peek', () => {
    const stepped = mount('peek');
    swipe(-120);
    expect(stepped).toHaveBeenLastCalledWith(HEIGHTS.half);
    swipe(120);
    expect(stepped).toHaveBeenLastCalledWith(HEIGHTS.peek);
    expect(stepped).toHaveBeenCalledTimes(2);
  });

  it('says nothing at the top step, collapsed, or when the swipe stays on its step', () => {
    const stepped = mount('half');
    swipe(-120);
    expect(sheet().dataset.height).toBe('full');
    swipe(5);
    swipe(120);
    swipe(120);
    swipe(120);
    expect(sheet().dataset.height).toBe('collapsed');
    expect(stepped.mock.calls.map(([height]) => height)).toEqual([HEIGHTS.half, HEIGHTS.peek]);
  });
});

describe('the tiles stage', () => {
  const stage = (): HTMLElement => document.querySelector<HTMLElement>('[data-stage]')!;
  const pull = (travel: number): void => {
    act(() => {
      stage().firstElementChild!.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }),
      );
      window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 + travel }));
      window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 + travel }));
    });
  };

  it('folds on a swipe down instead of closing, climbs to the half and no higher', () => {
    const onClose = vi.fn();
    const heights: string[] = [];
    render(
      <BottomSheet
        stage
        hug
        title="Plateau personnel"
        initial="peek"
        onClose={onClose}
        onHeight={(next) => heights.push(next)}
      >
        <p>tuiles</p>
      </BottomSheet>,
    );
    pull(120);
    expect(stage().dataset.height).toBe('collapsed');
    pull(120);
    expect(onClose).not.toHaveBeenCalled();
    expect(stage().dataset.height).toBe('collapsed');
    pull(-120);
    pull(-120);
    pull(-120);
    expect(stage().dataset.height).toBe('half');
    expect(heights).toEqual(['collapsed', 'peek', 'half']);
  });

  it('claims no place, and says nothing to a selection', () => {
    const onClose = vi.fn();
    render(
      <SoleSurfaceProvider>
        <BottomSheet stage title="Plateau personnel" onClose={onClose}>
          <p>tuiles</p>
        </BottomSheet>
        <BottomSheet title="Infanterie" onClose={() => {}}>
          <p>fiche</p>
        </BottomSheet>
      </SoleSurfaceProvider>,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Infanterie' })).toBeTruthy();
  });
});
