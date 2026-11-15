// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { setMapMotionSetting } from '@/data/mapMotion';
import { PinContext } from '@/shell/ReserveCell';
import { GaugeBin } from './GaugeBin';

/**
 * **Un bac en jauge** (#251) : « plein » prend la place du débit comme « à sec », et le survol dit
 * pourquoi. Ce qui l'emporte : à sec, puis plein, puis le débit.
 */
let systemReduced = false;
vi.stubGlobal('matchMedia', (query: string) => ({
  get matches() {
    return systemReduced;
  },
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

beforeEach(() => {
  localStorage.clear();
  systemReduced = false;
  setMapMotionSetting('auto');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NOW = 1_000_000;

const viewWith = (overrides: Partial<Record<ResourceKey, object>> = {}) =>
  ({
    loadedAt: NOW,
    arcs: [],
    me: {
      chains: [],
      buildings: [],
      extraction: [],
      troops: [],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [
          key,
          { stock: 40, ratePerHour: 2, cap: 400, ...(overrides[key] ?? {}) },
        ]),
      ),
    },
  }) as unknown as PlayerView;

const mount = (view: PlayerView, pinned: ResourceKey[] = []) =>
  render(
    <PinContext.Provider value={{ pinned, onPin: () => {} }}>
      <GaugeBin
        resource="coal"
        view={view}
        now={NOW}
        shown={null}
        register={() => {}}
        onTake={null}
        density="ample"
      />
    </PinContext.Provider>,
  );
const bin = () => document.querySelector<HTMLElement>('[data-bin="coal"]')!;

describe('the gauge bin', () => {
  it('reads the rate under a bin that is neither full nor dry', () => {
    mount(viewWith());
    expect(bin().textContent).toContain(fr.personalBoard.rate(2));
    expect(bin().textContent).not.toContain(fr.resourceBand.full);
  });

  it('says « plein » in place of the rate when the bin is at its ceiling, and why on hover', () => {
    mount(viewWith({ coal: { stock: 400 } }));
    expect(bin().textContent).toContain(fr.resourceBand.full);
    expect(bin().textContent).not.toContain('/ h');
    expect(bin().title).toContain('tourne pour rien');
  });

  it('keeps « à sec » ahead of « plein »', () => {
    mount(viewWith({ coal: { stock: 0, ratePerHour: 0 } }));
    expect(bin().textContent).toContain(fr.resourceBand.dry);
    expect(bin().textContent).not.toContain(fr.resourceBand.full);
  });

  it('takes the pin of its ledger', () => {
    mount(viewWith(), ['coal']);
    expect(bin().getAttribute('aria-pressed')).toBe('true');
  });

  it('tags a gain under « actives » at full strength even when the system asks for less motion, and quietly under « auto »', () => {
    systemReduced = true;
    const pinned: ResourceKey[] = [];
    const bin = (view: PlayerView) => (
      <PinContext.Provider value={{ pinned, onPin: () => {} }}>
        <GaugeBin
          resource="coal"
          view={view}
          now={NOW}
          shown={null}
          register={() => {}}
          onTake={null}
          density="ample"
        />
      </PinContext.Provider>
    );
    const gain = () => viewWith({ coal: { stock: 90 } });
    setMapMotionSetting('auto');
    const quiet = render(bin(viewWith()));
    quiet.rerender(bin(gain()));
    expect(document.querySelector('.reserve-tag--quiet')).not.toBeNull();
    quiet.unmount();
    setMapMotionSetting('full');
    const lively = render(bin(viewWith()));
    lively.rerender(bin(gain()));
    expect(document.querySelector('.reserve-tag')).not.toBeNull();
    expect(document.querySelector('.reserve-tag--quiet')).toBeNull();
  });
});
