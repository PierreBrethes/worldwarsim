// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { ConsumptionTickets, MAX_TICKETS, pinToggled } from './ConsumptionTickets';

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
afterEach(cleanup);

describe('pinning', () => {
  it('keeps three at most, and the fourth replaces the oldest', () => {
    let held: ReturnType<typeof pinToggled> = [];
    for (const resource of ['food', 'coal', 'oil', 'steel'] as const)
      held = pinToggled(held, resource, MAX_TICKETS);
    expect(held).toEqual(['coal', 'oil', 'steel']);
  });

  it('takes a pinned ticket down on a second click', () => {
    expect(pinToggled(['food', 'coal'], 'food', MAX_TICKETS)).toEqual(['coal']);
  });
});

const resource = { stock: 100, ratePerHour: -4, cap: 400 };
const view = {
  loadedAt: Date.now(),
  me: {
    regions: [],
    extraction: [],
    chains: [],
    buildings: [],
    construction: null,
    constructionQueue: [],
    outposts: [],
    upkeep: {
      troops: 0,
      unsupplied: 0,
      foodPerHour: 0,
      outpostFoodPerHour: 0,
      listeningCoalPerHour: 0,
    },
    resources: {
      food: resource,
      steel: resource,
      coal: resource,
      oil: resource,
      ammunition: resource,
    },
  },
} as unknown as PlayerView;

describe('the tickets', () => {
  it('stand side by side under the band, each with its own unpin', () => {
    const onUnpin = vi.fn();
    render(
      <ConsumptionTickets view={view} pinned={['food', 'coal']} narrow={false} onUnpin={onUnpin} />,
    );
    expect(screen.getAllByRole('region')).toHaveLength(2);
    screen.getAllByRole('button', { name: fr.ledger.unpin })[0]!.click();
    expect(onUnpin).toHaveBeenCalledWith('food');
  });

  it('renders nothing when nothing is pinned', () => {
    const { container } = render(
      <ConsumptionTickets view={view} pinned={[]} narrow={false} onUnpin={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
