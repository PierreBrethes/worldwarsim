// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function setup(at: { x: number; y: number } | null) {
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
        held="building-x"
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
