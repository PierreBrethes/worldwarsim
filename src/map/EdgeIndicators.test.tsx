// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOGGLES } from '@/domain/indicators';
import { fr } from '@/i18n/fr';
import { BoardInsetsContext } from '@/shell/viewport';
import { EdgeIndicators } from './EdgeIndicators';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  // jsdom has no layout: the layer is 390 x 844.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(844);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const insets = { top: 60, right: 0, bottom: 400, left: 0 };

function setup(at: { x: number; y: number } | null, covered = 0) {
  const engine = {
    boardPointOfAnchor: vi.fn(() => at),
    journeyTo: vi.fn(),
    subscribeRest: () => () => {},
    invalidate: vi.fn(),
    onEdges: (() => {}) as (projections: unknown[]) => void,
  };
  const view = render(
    <BoardInsetsContext.Provider value={insets}>
      <EdgeIndicators
        labels={[]}
        engine={engine as never}
        toggles={{} as never}
        destinations={new Map()}
        held={{ id: 'building-x', covered }}
      />
    </BoardInsetsContext.Provider>,
  );
  act(() => engine.onEdges([]));
  const token = view.getByRole('button', { name: fr.edgeIndicators.held, hidden: true });
  return { engine, token, anchor: token.parentElement! };
}

/** L'objet que la feuille tient se rappelle au bord dès qu'il n'est plus dans le champ libre, et
 *  un toucher y ramène la carte, au-dessus de la feuille. */
describe('EdgeIndicators, the held object (#591)', () => {
  it('shows no token while the object stands in the free frame', () => {
    expect(setup({ x: 200, y: 300 }).anchor.style.display).toBe('none');
  });

  it('shows the token once the sheet covers the object', () => {
    expect(setup({ x: 200, y: 700 }).anchor.style.display).toBe('');
  });

  it('shows the token for an object out of the frame', () => {
    expect(setup({ x: -200, y: 300 }).anchor.style.display).toBe('');
  });

  it('keeps the published margin when the measured sheet stands lower', () => {
    expect(setup({ x: 200, y: 350 }, 300).anchor.style.display).toBe('none');
  });

  it('takes the sheet as it is measured when it stands higher than the published margin', () => {
    expect(setup({ x: 200, y: 350 }, 500).anchor.style.display).toBe('');
  });

  it('brings the camera back above the sheet on a touch', () => {
    const { engine, token } = setup({ x: 200, y: 700 });
    fireEvent.click(token);
    expect(engine.journeyTo).toHaveBeenCalledExactlyOnceWith(
      ['building-x'],
      [],
      200,
      undefined,
      true,
    );
  });

  it('asks for a frame when it is born', () => {
    const { engine } = setup({ x: 200, y: 700 });
    expect(engine.invalidate).toHaveBeenCalled();
  });
});

/** Les jetons d'une catégorie qui ne change rien sur la carte suivent la seule bascule
 *  « hors champ » (#604) : éteinte, aucun jeton ; allumée, le jeton des forces revient. */
describe('EdgeIndicators, the « hors champ » layer (#604)', () => {
  const forces = { id: 'stack-1', type: 'stack', priority: 3, lines: [] } as never;

  function tokens(offscreen: boolean) {
    const engine = {
      boardPointOfAnchor: vi.fn(() => null),
      journeyTo: vi.fn(),
      subscribeRest: () => () => {},
      invalidate: vi.fn(),
      onEdges: (() => {}) as (projections: unknown[]) => void,
    };
    const props = {
      labels: [forces],
      engine: engine as never,
      destinations: new Map<string, string>(),
    };
    const view = render(
      <EdgeIndicators {...props} toggles={{ ...DEFAULT_TOGGLES, offscreen: !offscreen }} />,
    );
    act(() =>
      engine.onEdges([{ id: 'stack-1', atEdge: true, edgeX: 380, edgeY: 300, distance: 900 }]),
    );
    view.rerender(<EdgeIndicators {...props} toggles={{ ...DEFAULT_TOGGLES, offscreen }} />);
    return view.container.querySelectorAll('.indicator--forces').length;
  }

  it('folds the forces off the edge while « hors champ » is off', () => {
    expect(tokens(false)).toBe(0);
  });

  it('parks the forces at the edge once « hors champ » is on', () => {
    expect(tokens(true)).toBe(1);
  });
});
