// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr, roleLabel } from '@/i18n/fr';
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
  ground: 'land',
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
  mending: false,
});

/** **Cocher, c'est composer la main** (ADR 0026 §6) : la fiche rend la composition, sans lâcher. */
describe('HandSheet', () => {
  it('hands each change of its boxes to the hand', () => {
    const onCompose = vi.fn();
    const held = [troop('inf', 'infantry'), troop('tank', 'armor')];
    render(
      <HandSheet
        view={
          {
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Saône-et-Loire"
        held={held}
        troopIds={['inf', 'tank']}
        onCompose={onCompose}
        onDisembark={() => {}}
        founding={null}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    expect(screen.getByText(fr.hand.kicker('Saône-et-Loire'))).toBeTruthy();
    expect(onCompose).toHaveBeenLastCalledWith(['inf', 'tank']);
    const boxes = screen.getAllByRole('checkbox');
    act(() => boxes[1]!.click());
    expect(onCompose).toHaveBeenLastCalledWith(['inf']);
    expect(screen.queryByText(fr.garrison.prepare)).toBeNull();
  });

  it('reads the statistics of the troops it holds, and no longer a bare detection range', () => {
    const held = [troop('inf', 'infantry'), troop('tank', 'armor')];
    const { container } = render(
      <HandSheet
        view={
          {
            mode: 'mondiale',
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Saône-et-Loire"
        held={held}
        troopIds={['inf']}
        onCompose={() => {}}
        onDisembark={() => {}}
        founding={null}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    const stat = (key: string) => container.querySelector(`[data-stat="${key}"]`);
    expect(stat('pace')).not.toBeNull();
    expect(stat('detection')?.textContent).toContain('60 km');
    expect(stat('fuel')?.textContent).toContain('marche');
    expect(container.textContent).not.toContain(fr.garrison.paces.foot);
  });
});

/** **Une pile réduite à une troupe est une troupe seule** (#301) : il n'y a rien à cocher, la
 *  fiche la lit sans case, sans raccourci. Dès qu'une deuxième la rejoint, les cases reviennent. */
describe('HandSheet, a lone troop', () => {
  const sheet = (held: ReadonlyArray<TroopView>) => (
    <HandSheet
      view={
        {
          me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 1 } },
        } as unknown as PlayerView
      }
      station={station}
      place="Saône-et-Loire"
      held={held}
      troopIds={held.map((one) => one.id)}
      onCompose={() => {}}
      onDisembark={() => {}}
      founding={null}
      onOpenGunnery={() => {}}
      onDrop={() => {}}
      onApproach={() => {}}
    />
  );

  it('offers no box to tick when the pile is one troop', () => {
    render(sheet([troop('truck', 'landTransport')]));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByText(fr.garrison.pickAll)).toBeNull();
    expect(screen.getByText(roleLabel('landTransport', 1))).toBeTruthy();
  });

  it('gets its boxes back when a second troop joins', () => {
    render(sheet([troop('truck', 'landTransport'), troop('inf', 'infantry')]));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });
});

describe('HandSheet in a Blitz', () => {
  it('shows the one unit in a strip, without the pile or its range', () => {
    render(
      <HandSheet
        view={
          {
            mode: 'blitz',
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Portugal"
        held={[troop('inf', 'infantry')]}
        troopIds={['inf']}
        onCompose={() => {}}
        onDisembark={() => {}}
        founding={null}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    expect(screen.getByText(fr.troops.strength(50, 50))).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/relève à/)).toBeNull();
  });

  it('sets the infantry ashore beside its truck', () => {
    const onDisembark = vi.fn();
    render(
      <HandSheet
        view={
          {
            mode: 'blitz',
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Portugal"
        held={[
          { ...troop('inf', 'infantry'), carriedBy: 'truck' },
          troop('truck', 'landTransport'),
        ]}
        troopIds={['inf', 'truck']}
        onCompose={() => {}}
        onDisembark={onDisembark}
        founding={null}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );
    act(() => screen.getByRole('button', { name: fr.hand.disembark }).click());
    expect(onDisembark).toHaveBeenLastCalledWith(['inf']);
  });
});

/** **Fonder d'ici** : la branche de la rose, ou son motif — jamais un bouton grisé (ADR 0015). */
describe('HandSheet founding', () => {
  const sheet = (founding: Parameters<typeof HandSheet>[0]['founding']) =>
    render(
      <HandSheet
        view={
          {
            me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
          } as unknown as PlayerView
        }
        station={station}
        place="Saône-et-Loire"
        held={[troop('inf', 'infantry')]}
        troopIds={['inf']}
        onCompose={() => {}}
        onDisembark={() => {}}
        founding={founding}
        onOpenGunnery={() => {}}
        onDrop={() => {}}
        onApproach={() => {}}
      />,
    );

  it('founds through the rose branch it was handed', () => {
    const onFound = vi.fn();
    const action = {
      key: 'found',
      bill: [{ text: 'acier 20 / 40', lacking: false }],
      duration: '2 h',
    } as unknown as NonNullable<Parameters<typeof HandSheet>[0]['founding']>['action'];
    sheet({ action, refusal: null, onFound });
    act(() => screen.getByRole('button', { name: /fonder un avant-poste ici/i }).click());
    expect(onFound).toHaveBeenCalledOnce();
    expect(screen.getByText(/acier 20 \/ 40 · 2 h/)).toBeTruthy();
  });

  it('says the motive instead of a button when the rose would', () => {
    sheet({ action: null, refusal: 'déjà à vous', onFound: () => {} });
    expect(screen.queryByText(fr.hand.found)).toBeNull();
    expect(screen.getByText('déjà à vous')).toBeTruthy();
  });
});
