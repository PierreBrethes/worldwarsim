// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMapMotionSetting } from '@/data/mapMotion';
import { fr } from '@/i18n/fr';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { PileTabs } from './PileTabs';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  setMapMotionSetting('full');
});
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
const view = {
  mode: 'mondiale',
  me: { nation: 'france', stationedCargo: [], troops: [], upkeep: { troops: 2 } },
} as unknown as PlayerView;
const held = [troop('inf', 'infantry'), troop('tank', 'armor')];

const pile = (onPickedChange: (ids: ReadonlyArray<string>) => void = () => {}) =>
  render(
    <PileTabs
      view={view}
      station={station}
      held={held}
      preselect={['inf', 'tank']}
      canPrepare
      observing={false}
      onPickedChange={onPickedChange}
    />,
  );
const tab = (name: string) => screen.getByRole('tab', { name });
const stat = (container: HTMLElement, key: string) =>
  container.querySelector(`[data-stat="${key}"]`);

describe('PileTabs', () => {
  it('opens on the troops, and reads the statistics of the other rubrics only', () => {
    const { container } = pile();
    expect(tab(fr.hand.troopsTab).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(stat(container, 'pace')).toBeNull();

    act(() => tab(fr.stats.rubrics.move).click());
    expect(stat(container, 'pace')).not.toBeNull();
    expect(stat(container, 'detection')).not.toBeNull();
    expect(stat(container, 'loot')).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    act(() => tab(fr.stats.rubrics.carry).click());
    expect(stat(container, 'loot')).not.toBeNull();
    expect(stat(container, 'pace')).toBeNull();
  });

  it('reads the loot under the troops it ticks', () => {
    const { container } = pile();
    expect(container.querySelector('[data-testid="pile-loot"] [data-stat="loot"]')).not.toBeNull();
  });

  it('keeps the sheet on « Aucune » and says there is nothing to send', () => {
    const onPickedChange = vi.fn();
    pile(onPickedChange);
    expect(screen.queryByText(fr.hand.nothingToSend)).toBeNull();
    act(() => screen.getByRole('button', { name: fr.garrison.pickNone }).click());
    expect(onPickedChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByText(fr.hand.nothingToSend)).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
  });

  it('says the others stay in place when some troops are left unticked', () => {
    pile();
    expect(screen.queryByText(fr.hand.othersStay)).toBeNull();
    act(() => screen.getAllByRole('checkbox')[1]!.click());
    expect(screen.getByText(fr.hand.othersStay)).toBeTruthy();
  });

  it.each(['full', 'reduced', 'off'] as const)(
    'underlines the active tab at the « %s » setting, and fades its content unless off',
    (setting) => {
      setMapMotionSetting(setting);
      const { container } = pile();
      act(() => tab(fr.stats.rubrics.fight).click());
      expect(tab(fr.stats.rubrics.fight).className).toContain('border-[var(--ink)]');
      expect(tab(fr.hand.troopsTab).className).not.toContain('border-[var(--ink)]');
      expect(container.querySelector('.tab-fade') !== null).toBe(setting !== 'off');
    },
  );
});
