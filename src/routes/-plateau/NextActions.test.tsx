// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { NextActions } from './NextActions';

afterEach(cleanup);

const stack = (id: string, lon: number) => ({
  id,
  role: 'infantry',
  strength: 50,
  nominalStrength: 50,
  supplied: true,
  stationedAt: { kind: 'point', lonLat: [lon, 45], country: 'CAN', afloat: false, coastal: false },
});

const viewOf = (lons: ReadonlyArray<number>): PlayerView =>
  ({
    arcs: [],
    loadedAt: 0,
    season: { outcome: { concludedAt: null } },
    captures: [],
    firstSteps: { done: [], shown: 'skipped' },
    me: {
      homePosition: [2, 47],
      hqLevel: 1,
      foundation: [],
      construction: { id: 'W-1', outpostId: null },
      constructionQueue: [],
      resources: {},
      buildings: [],
      recruiting: [],
      regions: [],
      outposts: [],
      slots: { total: 2, used: 2 },
      troops: lons.map((lon, index) => stack(`T-${lon}-${index}`, lon)),
    },
  }) as unknown as PlayerView;

const mount = (view: PlayerView, onGoToMap: (point: unknown) => void) =>
  render(
    <NextActions
      view={view}
      placements={[]}
      armed={null}
      error={null}
      onArm={() => {}}
      onGoToMap={onGoToMap}
      onOpenSurface={() => {}}
      onOpenSite={() => {}}
      onOpenOutpost={() => {}}
    />,
  );

describe('a line with several occurrences', () => {
  it('walks through them one click at a time, then comes back to the first', () => {
    const goTo = vi.fn();
    mount(viewOf([-10, -20, -30]), goTo);
    const row = () => screen.getByRole('button', { name: /3 troupes sans ordre/ });

    expect(row().textContent).toContain('carte 1 / 3');
    fireEvent.click(row());
    expect(row().textContent).toContain('carte 2 / 3');
    fireEvent.click(row());
    fireEvent.click(row());

    expect(goTo.mock.calls.map(([point]) => point)).toEqual([
      [-10, 45],
      [-20, 45],
      [-30, 45],
    ]);
    expect(row().textContent).toContain('carte 1 / 3');
    fireEvent.click(row());
    expect(goTo).toHaveBeenLastCalledWith([-10, 45]);
  });

  it('keeps its rank when the sheet unmounts, and starts over when the targets change', () => {
    const goTo = vi.fn();
    const view = viewOf([-11, -21, -31]);
    const first = mount(view, goTo);
    fireEvent.click(screen.getByRole('button', { name: /3 troupes sans ordre/ }));
    first.unmount();

    const again = mount(view, goTo);
    fireEvent.click(screen.getByRole('button', { name: /3 troupes sans ordre/ }));
    expect(goTo).toHaveBeenLastCalledWith([-21, 45]);
    again.unmount();

    // Same count, other piles: the rank falls back to the first.
    mount(viewOf([-11, -21, -41]), goTo);
    fireEvent.click(screen.getByRole('button', { name: /3 troupes sans ordre/ }));
    expect(goTo).toHaveBeenLastCalledWith([-11, 45]);
  });
});
