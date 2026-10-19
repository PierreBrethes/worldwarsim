// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChainView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { LotControl } from './LotControl';

const place = vi.fn(() => Promise.resolve());
vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) =>
    String(reference).includes('order') && !String(reference).includes('cancel')
      ? place
      : () => Promise.resolve(),
}));
vi.mock('../../../convex/_generated/api', () => ({
  api: { industry: { order: 'industry.order', cancelOrder: 'industry.cancelOrder' } },
}));
afterEach(() => {
  cleanup();
  place.mockClear();
});

const line = (output: 'ammunition' | 'oil', quantity: number, lockedBy: null) => ({
  output,
  inputs: [{ resource: 'coal' as const, quantity }],
  nominalPerHour: 3,
  lockedBy,
  maxOrder: 100,
});

const chain = {
  by: 'arsenal',
  output: 'ammunition',
  inputs: [{ resource: 'coal', quantity: 1 }],
  perHour: 0,
  nominalPerHour: 3,
  level: 1,
  state: 'idle',
  missing: null,
  commanded: true,
  order: null,
  lines: [line('ammunition', 1, null), line('oil', 3, null)],
} as unknown as ChainView;

describe('LotControl', () => {
  it('sends the line the player picked, not the default one', () => {
    render(
      <LotControl
        chain={chain}
        seat={{ token: 't', seasonId: 's' } as never}
        loadedAt={0}
        now={0}
        observing={false}
      />,
    );
    fireEvent.click(screen.getByText(fr.economy.lot.order));
    fireEvent.click(screen.getByRole('button', { name: fr.resources.oil }));
    fireEvent.click(screen.getByText(fr.economy.lot.launch));
    expect(place).toHaveBeenCalledWith(expect.objectContaining({ chain: 'arsenal', line: 'oil' }));
  });
});
