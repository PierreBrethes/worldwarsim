// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Building, PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { DemolitionCard } from './DemolitionCard';

const calls: string[] = [];
const demolish = vi.fn(() => {
  calls.push('demolish');
  return Promise.resolve();
});
vi.mock('convex/react', () => ({ useMutation: () => demolish }));
vi.mock('../../../convex/_generated/api', () => ({ api: { buildings: { demolish: 'demolish' } } }));
vi.mock('@/domain/construction', () => ({ pledgedWork: () => [], demolitionClipping: () => [] }));
afterEach(() => {
  cleanup();
  calls.length = 0;
  demolish.mockClear();
});

const building = { id: 'b1', name: 'Caserne', level: 1, regionId: 'r1' } as unknown as Building;
const view = {
  me: { regions: [], troops: [], recruiting: [] },
  loadedAt: 0,
} as unknown as PlayerView;

const card = (onRazing: () => void, onRefused: () => void, onClose = () => {}) =>
  render(
    <DemolitionCard
      seat={{ token: 't', seasonId: 's' } as never}
      view={view}
      building={building}
      at={{ x: 0, y: 0 }}
      onRazing={onRazing}
      onRefused={onRefused}
      onClose={onClose}
    />,
  );

describe('DemolitionCard', () => {
  it('tells the map what falls before the server is asked: the next view loses it (#326)', async () => {
    const onClose = vi.fn();
    card(
      () => calls.push('razing'),
      () => calls.push('refused'),
      onClose,
    );
    fireEvent.click(screen.getByText(fr.demolition.submit));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls).toEqual(['razing', 'demolish']);
  });

  it('says a refusal to the map: nothing falls', async () => {
    demolish.mockImplementationOnce(() => Promise.reject(new Error('NOT_YOURS')));
    const refused = vi.fn();
    card(() => {}, refused);
    fireEvent.click(screen.getByText(fr.demolition.submit));
    await waitFor(() => expect(refused).toHaveBeenCalled());
  });
});
