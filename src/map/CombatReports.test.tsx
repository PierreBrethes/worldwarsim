// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayView } from '@/domain/player-view';
import { CombatReports } from './CombatReports';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

const sunk: ReplayView = {
  combatId: 'c',
  at: 0,
  point: { lon: -1.6, lat: 50 },
  side: 'defender',
  won: false,
  mine: [{ role: 'cargo', tier: 1, troops: 1, lost: 12, routed: 0, destroyed: 1 }],
  theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
  drowned: { men: 100, machines: 48, seats: 9 },
};

/** The seats tag of a hull going down, over a map that places it at `at` (or nowhere). */
function tagAt(at: { x: number; y: number } | null, struck = false) {
  const engine = {
    where: at,
    screenOf: () => engine.where,
    invalidate: () => {},
    onReportsFrame: undefined as (() => void) | undefined,
    landAt: () => false,
  };
  const { container } = render(
    <CombatReports
      reports={[]}
      tags={[{ view: sunk, struck }]}
      engine={engine as never}
      onOpen={() => {}}
      onLift={() => {}}
    />,
  );
  act(() => engine.onReportsFrame?.());
  return Object.assign(container.querySelector<HTMLElement>('[data-seats-tag]')!, { engine });
}

describe('the seats tag of a hull going down', () => {
  it('reads the sign and the seats, then only the sign once struck through', () => {
    expect(tagAt({ x: 0, y: 0 }).textContent).toBe('CGO · 9/12');
    cleanup();
    const struck = tagAt({ x: 0, y: 0 }, true);
    expect(struck.textContent).toBe('CGO');
    expect(struck.querySelector('s')).not.toBeNull();
  });

  it('is hidden as the stamps are when the map does not place its point', () => {
    const node = tagAt({ x: 0, y: 0 });
    expect(node.style.visibility).toBe('visible');
    node.engine.where = null;
    act(() => node.engine.onReportsFrame?.());
    expect(node.style.visibility).toBe('hidden');
  });
});
