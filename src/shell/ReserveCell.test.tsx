// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { dryLabelOf, PinContext, ReserveCell } from './ReserveCell';

/**
 * **Une réserve sur la ligne de la barre** (#179) : le stock, le débit par heure ou, à sec,
 * l'étiquette rouge qui le remplace. Une seule ligne, lue par la barre du téléphone et par la ligne
 * repliée du plateau au bureau.
 */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const NOW = 1_000_000;

const viewWith = (overrides: Partial<Record<ResourceKey, object>> = {}) =>
  ({
    loadedAt: NOW,
    me: {
      chains: [],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [
          key,
          { stock: 40, ratePerHour: 2, cap: 400, ...(overrides[key] ?? {}) },
        ]),
      ),
    },
  }) as unknown as PlayerView;

const mount = (view: PlayerView, { onPin = vi.fn(), onTake = null as null | (() => void) } = {}) =>
  render(
    <PinContext.Provider value={{ pinned: [], onPin }}>
      {RESOURCES.map((resource) => (
        <ReserveCell
          key={resource}
          resource={resource}
          view={view}
          now={NOW}
          onTake={resource === 'ammunition' ? onTake : null}
        />
      ))}
    </PinContext.Provider>,
  );

const cell = (resource: ResourceKey) => document.querySelector(`[data-bin="${resource}"]`)!;

describe('the reserve cell', () => {
  it('reads one cell per reserve, with the rate under the stock', () => {
    mount(viewWith());
    expect(document.querySelectorAll('[data-bin]')).toHaveLength(RESOURCES.length);
    expect(cell('coal').textContent).toContain(fr.personalBoard.rateShort(2));
  });

  it('puts the alert where the rate was, under a dry reserve and never under a full one', () => {
    mount(
      viewWith({
        coal: { stock: 400 },
        oil: { stock: 0, ratePerHour: 0 },
        steel: { stock: 30, ratePerHour: -2.9 },
      }),
    );
    expect(cell('oil').textContent).toContain(fr.resourceBand.dry);
    expect(cell('oil').textContent).not.toContain('/h');
    expect(cell('steel').textContent).toContain(fr.resourceBand.drySoonShort(10));
    expect(cell('coal').textContent).not.toContain('sec');
    expect(screen.queryAllByText(/à sec/i)).toHaveLength(2);
  });

  it('asks for a reserve’s ledger on a touch', () => {
    const onPin = vi.fn();
    mount(viewWith(), { onPin });
    act(() => (cell('coal') as HTMLElement).click());
    expect(onPin).toHaveBeenCalledWith('coal');
  });

  it('pins a reserve that can be taken on a press that did not move, and not on a drag', () => {
    const onPin = vi.fn();
    const onTake = vi.fn();
    mount(viewWith(), { onPin, onTake });
    const ammunition = cell('ammunition');

    fireEvent.pointerDown(ammunition, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(ammunition, { clientX: 11, clientY: 10 });
    expect(onTake).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledWith('ammunition');

    onPin.mockClear();
    fireEvent.pointerDown(ammunition, { clientX: 10, clientY: 10 });
    fireEvent.pointerUp(ammunition, { clientX: 90, clientY: 40 });
    expect(onPin).not.toHaveBeenCalled();
  });
});

describe('dryLabelOf', () => {
  it('says « à sec » for an empty stock, the hours left for a draining one, nothing else', () => {
    expect(dryLabelOf(0, 5)).toBe(fr.resourceBand.dry);
    expect(dryLabelOf(30, -2.9)).toBe(fr.resourceBand.drySoonShort(10));
    expect(dryLabelOf(5, -0.1)).toBeNull();
    expect(dryLabelOf(30, 0)).toBeNull();
  });
});
