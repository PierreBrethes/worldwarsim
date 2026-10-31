// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutpostView, PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { DismantleCard } from './DismantleCard';

const calls: string[] = [];
const dismantle = vi.fn(() => {
  calls.push('dismantle');
  return Promise.resolve();
});
type Told = { regions: number; anchored: Array<{ key: string; point: [number, number] }> };
const told = (): Told => ({ regions: 2, anchored: [{ key: 'listening', point: [2, 48] }] });
let colour: Told | undefined = told();
vi.mock('convex/react', () => ({ useMutation: () => dismantle, useQuery: () => colour }));
vi.mock('../../../convex/_generated/api', () => ({
  api: { outposts: { dismantle: 'dismantle', soleHold: 'soleHold' } },
}));
vi.mock('@/domain/construction', () => ({ pledgedWork: () => [] }));
vi.mock('@/domain/logistics', () => ({
  depotRefundOf: () => ({ returned: {}, lost: {} }),
  loadTotal: () => 0,
}));
vi.mock('@/domain/player-view', () => ({ currentStock: () => 0 }));
afterEach(() => {
  cleanup();
  calls.length = 0;
  dismantle.mockClear();
  colour = told();
});

const outpost = {
  id: 'o1',
  level: 1,
  regionId: 'r1',
  hostCountry: 'ROU',
  depot: {},
  standsAt: null,
} as unknown as OutpostView;
const mast = { id: 'b1', key: 'listening', point: [2, 48], regionId: 'r2', name: 'Écoute' };
const other = { id: 'b2', key: 'farm', point: [5, 45], regionId: 'r3', name: 'Ferme' };
const view = {
  me: {
    regions: [],
    buildings: [mast, other],
    troops: [],
    resources: { ammunition: { cap: 0 }, oil: { cap: 0 }, coal: { cap: 0 } },
  },
  loadedAt: 0,
} as unknown as PlayerView;

const card = (
  onDismantling: (fall: { area: boolean; buildings: ReadonlyArray<string> }) => void,
  onRefused: (buildings: ReadonlyArray<string>) => void = () => {},
) =>
  render(
    <DismantleCard
      seat={{ token: 't', seasonId: 's' } as never}
      view={view}
      outpost={outpost}
      at={{ x: 0, y: 0 }}
      onDismantling={onDismantling}
      onRefused={onRefused}
      onClose={() => {}}
    />,
  );

describe('DismantleCard', () => {
  it('tells the map what falls before the server is asked: the point, its area, its masts (#340)', async () => {
    const said = vi.fn((_fall: unknown) => calls.push('dismantling'));
    card(said);
    fireEvent.click(screen.getByText(fr.dismantle.submit));
    await waitFor(() => expect(dismantle).toHaveBeenCalled());
    expect(calls).toEqual(['dismantling', 'dismantle']);
    // Only the masts the server names: the farm of another site is not told to fall.
    expect(said).toHaveBeenCalledWith({ area: true, buildings: ['building-listening@2,48'] });
    expect(screen.getByText(/Écoute/)).toBeTruthy();
    expect(screen.queryByText(/Ferme/)).toBeNull();
  });

  it('sweeps no area when no region loses its colour, or the count has not come yet', async () => {
    colour = { regions: 0, anchored: [] };
    const said = vi.fn();
    card(said);
    fireEvent.click(screen.getByText(fr.dismantle.submit));
    await waitFor(() => expect(said).toHaveBeenCalled());
    expect(said.mock.calls[0]![0]).toMatchObject({ area: false });
  });

  it('says a refusal to the map: nothing falls', async () => {
    dismantle.mockImplementationOnce(() => Promise.reject(new Error('NOT_YOURS')));
    const refused = vi.fn();
    card(() => {}, refused);
    fireEvent.click(screen.getByText(fr.dismantle.submit));
    await waitFor(() => expect(refused).toHaveBeenCalledWith(['building-listening@2,48']));
  });
});
