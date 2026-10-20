// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapLabel } from '@/domain/labels';
import { CLASSIC_MAPPING } from '@/domain/mouse-mapping';
import { Pictogram } from '@/shell/IndicatorGlyph';
import { MapLabels } from './MapLabels';

vi.mock('@/shell/IndicatorGlyph', () => ({ Pictogram: vi.fn(() => null) }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.mocked(Pictogram).mockClear();
});

/** Every list the board hands over is rebuilt: equal labels, never the same objects. */
const outpost = (id: string, text: string): MapLabel =>
  ({
    id,
    type: 'outpost',
    priority: 1,
    anchor: { kind: 'ground', lonLat: [0, 0] },
    reach: null,
    ink: null,
    pictogram: 'outpost',
    plate: null,
    deposit: null,
    lootSightingId: null,
    lootCurrent: true,
    washed: false,
    lines: [{ role: 'nature', text }],
    identified: false,
    offensive: false,
    idle: false,
    works: null,
    hostCountry: null,
    building: null,
    installation: null,
    camp: null,
    objective: null,
    strategic: null,
    station: null,
    force: null,
  }) as MapLabel;

const noop = () => {};
const layer = (labels: ReadonlyArray<MapLabel>) => (
  <MapLabels
    labels={labels}
    engine={null}
    selected={null}
    selectedPlate={null}
    secondarySelected={null}
    onMovementHover={noop}
    onReachHover={noop}
    poster={() => null}
    onSelect={noop}
    onOpenBuilding={noop}
    onOpenStack={noop}
    onOpenLoot={noop}
    onOpenCamp={noop}
    onOpenObjective={noop}
    onOpenStrategic={noop}
    onAct={noop}
    mapping={CLASSIC_MAPPING}
    holding={false}
    onHoldOver={noop}
    muted={false}
  />
);

describe('MapLabels', () => {
  /** **Une réponse du serveur ne rend que les étiquettes qu'elle change** (#183). */
  it('renders again only the label whose text changed', () => {
    const { rerender } = render(layer([outpost('a', 'Lille'), outpost('b', 'Arras')]));
    const drawn = vi.mocked(Pictogram).mock.calls.length;
    rerender(layer([outpost('a', 'Lille'), outpost('b', 'Arras')]));
    expect(vi.mocked(Pictogram).mock.calls.length).toBe(drawn);
    rerender(layer([outpost('a', 'Lille'), outpost('b', 'Arras · 2')]));
    expect(vi.mocked(Pictogram).mock.calls.length).toBe(drawn + 1);
    expect(screen.getByText('Arras · 2')).toBeTruthy();
    expect(screen.getByText('Lille')).toBeTruthy();
  });

  /** **Un relevé perdu de vue vieillit sous les yeux** : son âge court sur l'horloge de la
   *  couche, sans attendre la réponse suivante (#183). */
  it('runs the age of a last known position on its own clock', () => {
    vi.useFakeTimers({ now: 10 * 60_000 });
    const camp = {
      ...outpost('c', 'camp'),
      lines: [{ role: 'age', since: 5 * 60_000 }],
    } as MapLabel;
    render(layer([camp]));
    expect(screen.getByText(/il y a 00:05:00/)).toBeTruthy();
    vi.advanceTimersByTime(60_000);
    expect(screen.getByText(/il y a 00:06:00/)).toBeTruthy();
    vi.useRealTimers();
  });
});
