// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMapMotionSetting } from '@/data/mapMotion';
import { fr } from '@/i18n/fr';
import type { PlayerView, TroopView } from '@/domain/player-view';
import { BottomSheet } from '@/shell/BottomSheet';
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
      expect(container.querySelector('[data-motion]')).toBeNull();
    },
  );

  it('keeps « préparer un mouvement » on all four tabs, over the troops ticked', () => {
    const onPrepare = vi.fn();
    render(
      <PileTabs
        view={view}
        station={station}
        held={held}
        preselect={['inf', 'tank']}
        canPrepare
        observing={false}
        onPrepare={onPrepare}
      />,
    );
    for (const name of [
      fr.hand.troopsTab,
      fr.stats.rubrics.move,
      fr.stats.rubrics.fight,
      fr.stats.rubrics.carry,
    ]) {
      act(() => tab(name).click());
      expect(screen.getAllByRole('button', { name: fr.garrison.prepare })).toHaveLength(1);
    }
    act(() => screen.getByRole('button', { name: fr.garrison.prepare }).click());
    expect(onPrepare).toHaveBeenCalledWith(station, ['inf', 'tank']);
  });

  it('wires each tab to its panel, and moves among them with the arrow keys', () => {
    pile();
    const troops = tab(fr.hand.troopsTab);
    const panel = screen.getByRole('tabpanel');
    expect(troops.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(troops.id);
    expect(troops.tabIndex).toBe(0);
    expect(tab(fr.stats.rubrics.move).tabIndex).toBe(-1);

    fireEvent.keyDown(troops, { key: 'ArrowRight' });
    expect(tab(fr.stats.rubrics.move).getAttribute('aria-selected')).toBe('true');
    expect(tab(fr.stats.rubrics.move).tabIndex).toBe(0);
    expect(troops.tabIndex).toBe(-1);
    fireEvent.keyDown(tab(fr.stats.rubrics.move), { key: 'End' });
    expect(tab(fr.stats.rubrics.carry).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab(fr.stats.rubrics.carry), { key: 'ArrowRight' });
    expect(tab(fr.hand.troopsTab).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab(fr.hand.troopsTab), { key: 'ArrowLeft' });
    expect(tab(fr.stats.rubrics.carry).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab(fr.stats.rubrics.carry), { key: 'Home' });
    expect(tab(fr.hand.troopsTab).getAttribute('aria-selected')).toBe('true');
  });

  it('tells its owner which tab is open', () => {
    const onTabChange = vi.fn();
    render(
      <PileTabs
        view={view}
        station={station}
        held={held}
        preselect={['inf']}
        canPrepare
        observing={false}
        onTabChange={onTabChange}
      />,
    );
    act(() => tab(fr.stats.rubrics.fight).click());
    expect(onTabChange).toHaveBeenLastCalledWith('fight');
  });

  it('puts « préparer » in the sheet’s foot, under the body that scrolls: no row passes beneath it (#588)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(
      <BottomSheet title="Caserne" onClose={() => {}} initial="half">
        <PileTabs
          view={view}
          station={station}
          held={held}
          preselect={['inf']}
          canPrepare
          observing={false}
          onPrepare={() => {}}
        />
      </BottomSheet>,
    );
    const prepare = screen.getByRole('button', { name: fr.garrison.prepare });
    expect(prepare.closest('.overflow-y-auto')).toBeNull();
    expect(prepare.closest('[role=dialog]')).not.toBeNull();
  });
});
