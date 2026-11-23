// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TOGGLES } from '@/domain/indicators';
import { fr } from '@/i18n/fr';
import { BoardInsetsContext } from '@/shell/viewport';
import { setMapMotionSetting } from '@/data/mapMotion';
import { EdgeIndicators } from './EdgeIndicators';

let narrow = true;

beforeEach(() => {
  narrow = true;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced') ? false : narrow,
    addEventListener() {},
    removeEventListener() {},
  }));
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

/** **Le jeton hors champ glisse le long du bord** pour dégager la bulle de pile en main (#623) :
 *  au téléphone seulement, interpolé en « actives », d'un saut sinon. */
describe('EdgeIndicators, a name sliding clear of the bubble (#623)', () => {
  const BUBBLE = { left: 100, top: 280, right: 340, bottom: 400 };
  const PILL = { left: 0, top: 0, right: 80, bottom: 44 };
  const frame = { id: 'paris', atEdge: true, edgeX: 390, edgeY: 300, distance: 900 };

  function boxOf(box: typeof BUBBLE): DOMRect {
    return { ...box, width: box.right - box.left, height: box.bottom - box.top } as DOMRect;
  }

  function scene() {
    vi.stubGlobal('performance', { now: () => clock });
    (Element.prototype as unknown as { checkVisibility: () => boolean }).checkVisibility = () =>
      true;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.classList.contains('cargo-tag-body')) return boxOf(BUBBLE);
      if (this.classList.contains('destination-edge')) return boxOf(PILL);
      return boxOf({ left: 0, top: 0, right: 390, bottom: 844 });
    });
    const engine = {
      boardPointOfAnchor: vi.fn(() => null),
      journeyTo: vi.fn(),
      subscribeRest: () => () => {},
      invalidate: vi.fn(),
      onEdges: (() => {}) as (projections: unknown[]) => void,
    };
    const view = render(
      <div>
        <div className="cargo-tags">
          <div className="cargo-tag">
            <div className="cargo-tag-body" />
          </div>
        </div>
        <EdgeIndicators
          labels={[]}
          engine={engine as never}
          toggles={DEFAULT_TOGGLES}
          destinations={new Map([['paris', 'Paris']])}
        />
      </div>,
    );
    const anchor = view.container.querySelector<HTMLElement>('.destination-anchor')!;
    const draw = () => act(() => engine.onEdges([frame]));
    return { engine, anchor, draw, view };
  }

  let clock = 0;
  beforeEach(() => {
    clock = 0;
    setMapMotionSetting('full');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('stays on the point where its target leaves the screen while nothing covers it', () => {
    const { anchor, draw, view } = scene();
    view.container.querySelector('.cargo-tag-body')!.className = 'gone';
    draw();
    clock = 2000;
    draw();
    expect(anchor.style.transform).toContain('translate3d(390px, 300px, 0)');
  });

  it('jumps clear of the bubble when motion is reduced or off, along its own edge', () => {
    for (const setting of ['reduced', 'off'] as const) {
      setMapMotionSetting(setting);
      const { anchor, draw, view } = scene();
      draw();
      expect(anchor.style.transform).toContain('translate3d(390px, 426px, 0)');
      view.unmount();
    }
  });

  it('glides there when motion is on, and lands on it', () => {
    const { anchor, draw } = scene();
    draw();
    expect(anchor.style.transform).toContain('translate3d(390px, 300px, 0)');
    clock = 40;
    draw();
    const mid = Number(/390px, ([\d.]+)px/.exec(anchor.style.transform)![1]);
    expect(mid).toBeGreaterThan(300);
    expect(mid).toBeLessThan(426);
    clock = 2000;
    draw();
    expect(anchor.style.transform).toContain('translate3d(390px, 426px, 0)');
  });

  it('leaves the desk alone: no bubble to clear off a wide screen', () => {
    narrow = false;
    const { anchor, draw } = scene();
    draw();
    clock = 2000;
    draw();
    expect(anchor.style.transform).toContain('translate3d(390px, 300px, 0)');
  });

  it('asks for frames when the bubble opens or closes, since the map no longer renders at rest', async () => {
    const { engine, view } = scene();
    engine.invalidate.mockClear();
    view.container.querySelector('.cargo-tag')!.classList.add('cargo-tag--selected');
    await act(async () => {});
    expect(engine.invalidate).toHaveBeenCalled();
  });
});
