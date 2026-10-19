// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr, roleLabel } from '@/i18n/fr';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { GarrisonStack } from './GarrisonStack';

/**
 * **Sous le seuil, une pile se compose en cartes** (refonte mobile, 1e) : on coche d'un toucher,
 * des raccourcis prennent tout, rien ou un rôle entier, et le compte reste au pied avec le bouton.
 */
beforeEach(() =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })),
);
afterEach(cleanup);

const station = { kind: 'building', buildingId: 'B-1' } as const;
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
const HELD = [troop('i-1', 'infantry'), troop('i-2', 'infantry'), troop('a-1', 'armor')];
const view = { me: { nation: 'france', stationedCargo: [], troops: [] } } as unknown as PlayerView;

const mount = (onPrepare = vi.fn()) => {
  render(
    <GarrisonStack
      view={view}
      station={station}
      held={HELD}
      preselect={[]}
      canPrepare
      observing={false}
      onPrepare={onPrepare}
    />,
  );
  return onPrepare;
};

describe('the garrison on a phone', () => {
  it('lays one card per troop, ticked by a touch, with the count kept at the foot', () => {
    mount();
    const cards = screen.getAllByRole('checkbox');
    expect(cards).toHaveLength(3);

    act(() => cards[0]!.click());
    expect(cards[0]!.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(fr.garrison.picked(1))).toBeTruthy();
  });

  it('takes a whole role, everything, or nothing in one touch', () => {
    const onPrepare = mount();

    act(() => screen.getByRole('button', { name: fr.garrison.pickRole('infanterie', 2) }).click());
    expect(screen.getByText(fr.garrison.picked(2))).toBeTruthy();

    act(() => screen.getByRole('button', { name: fr.garrison.pickAll }).click());
    act(() => screen.getByRole('button', { name: fr.garrison.prepare }).click());
    expect(onPrepare).toHaveBeenCalledWith(station, ['i-1', 'i-2', 'a-1']);

    act(() => screen.getByRole('button', { name: fr.garrison.pickNone }).click());
    expect(screen.getByText(fr.garrison.picked(0))).toBeTruthy();
  });

  /** Le retrait sous la coque n'existe pas en cartes : le passager la nomme (noyé, il coule avec). */
  it('names the hull a passenger rides', () => {
    render(
      <GarrisonStack
        view={view}
        station={station}
        held={[troop('c-1', 'cargo'), { ...troop('i-1', 'infantry'), carriedBy: 'c-1' }]}
        preselect={['c-1', 'i-1']}
        canPrepare
        observing={false}
        onPrepare={vi.fn()}
      />,
    );
    expect(screen.getByText(fr.garrison.aboard(roleLabel('cargo', 1)))).toBeTruthy();
  });
});
