// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { HandSheet } from './HandSheet';

beforeEach(() =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(cleanup);

const station = {
  kind: 'point',
  lonLat: [4.6, 46.6],
  country: 'FRA',
  afloat: false,
  coastal: false,
} as const;
const troop = (id: string, role: TroopView['role']): TroopView => ({
  id,
  role,
  tier: 1,
  strength: 50,
  nominalStrength: 50,
  stationedAt: station,
  supplied: true,
});

/** **Cocher, c'est composer la main** (ADR 0026 §6) : la fiche rend la composition, sans lâcher. */
describe('HandSheet', () => {
  it('hands each change of its boxes to the hand', () => {
    const onCompose = vi.fn();
    const held = [troop('inf', 'infantry'), troop('tank', 'armor')];
    render(
      <HandSheet
        view={{ me: { nation: 'france', stationedCargo: [] } } as unknown as PlayerView}
        station={station}
        place="Saône-et-Loire"
        held={held}
        troopIds={['inf', 'tank']}
        onCompose={onCompose}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
      />,
    );
    expect(screen.getByText(fr.hand.kicker('Saône-et-Loire'))).toBeTruthy();
    expect(onCompose).toHaveBeenLastCalledWith(['inf', 'tank']);
    const boxes = screen.getAllByRole('checkbox');
    act(() => boxes[1]!.click());
    expect(onCompose).toHaveBeenLastCalledWith(['inf']);
    expect(screen.queryByText(fr.garrison.prepare)).toBeNull();
  });
});
