import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
    const view = { me: { nation: 'france' } } as unknown as PlayerView;

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
