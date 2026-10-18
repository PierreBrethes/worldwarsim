// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { GarrisonStack } from './GarrisonStack';

/** Au bureau : sous le seuil la capacité de butin se lit dans la ligne au-dessus du bouton. */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

const station = { kind: 'home' } as const;
const troop = (
  id: string,
  role: TroopView['role'],
  strength: number,
  nominalStrength: number,
): TroopView => ({
  id,
  role,
  tier: 1,
  strength,
  nominalStrength,
  stationedAt: station,
  supplied: true,
  mending: false,
});

describe('GarrisonStack', () => {
  it('prints effective loot capacity for the picked group only', () => {
    const held = [
      troop('infantry', 'infantry', 25, 50),
      troop('truck', 'landTransport', 12, 24),
      troop('cargo', 'cargo', 8, 8),
    ];
    const view = { me: { nation: 'france', troops: [] } } as unknown as PlayerView;

    const markup = renderToStaticMarkup(
      <GarrisonStack
        view={view}
        station={station}
        held={held}
        preselect={['infantry', 'truck']}
        canPrepare
        observing={false}
        onPrepare={() => undefined}
      />,
    );

    expect(markup).toContain('capacité de butin : 80');
    expect(markup).not.toContain('capacité de butin : 320');
  });
});

/** **Un passager suit son transport** (15/10) : il se lit sous lui, il ne se coche pas seul, et il
 *  descend d'un bouton. */
describe('GarrisonStack, a transport and its passengers', () => {
  const view = {
    me: { nation: 'france', stationedCargo: [], troops: [] },
  } as unknown as PlayerView;
  const held = [
    troop('truck', 'landTransport', 24, 24),
    { ...troop('rifle', 'infantry', 50, 50), carriedBy: 'truck' },
    troop('walker', 'infantry', 50, 50),
  ];

  it('ticks the passenger with its transport, and sets it ashore by its own button', () => {
    const picked = vi.fn();
    const ashore = vi.fn();
    render(
      <GarrisonStack
        view={view}
        station={station}
        held={held}
        preselect={[]}
        canPrepare
        observing={false}
        onPickedChange={picked}
        onDisembark={ashore}
      />,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    act(() => screen.getAllByRole('checkbox')[1]!.click());
    expect(picked).toHaveBeenLastCalledWith(['truck', 'rifle']);
    act(() => screen.getByRole('button', { name: fr.hand.disembark }).click());
    expect(ashore).toHaveBeenCalledWith(['rifle']);
  });
});
