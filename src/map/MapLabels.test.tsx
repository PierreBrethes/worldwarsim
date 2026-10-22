// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapLabel } from '@/domain/labels';
import { CLASSIC_MAPPING } from '@/domain/mouse-mapping';
import { Pictogram } from '@/shell/IndicatorGlyph';
import type { CargoTag } from '@/domain/cargo-tag';
import type { CargoAim } from './CargoTags';
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
const layer = (
  labels: ReadonlyArray<MapLabel>,
  held: { holding: boolean; onAct: () => void; onCancelHeld: () => void } = {
    holding: false,
    onAct: noop,
    onCancelHeld: noop,
  },
) => (
  <MapLabels
    labels={labels}
    engine={null}
    selected={null}
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
    onAct={held.onAct}
    onCancelHeld={held.onCancelHeld}
    mapping={CLASSIC_MAPPING}
    holding={held.holding}
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

  /** **Pièce en main, le clic droit sur une étiquette la repose** (#229) : aucune rose. Sans pièce
   *  en main, il agit comme avant. */
  it('puts a held piece back on a right click, and acts when none is held', () => {
    const onAct = vi.fn();
    const onCancelHeld = vi.fn();
    const { rerender } = render(
      layer([outpost('a', 'Lille')], { holding: true, onAct, onCancelHeld }),
    );
    fireEvent.contextMenu(screen.getByText('Lille'), { button: 2 });
    expect(onCancelHeld).toHaveBeenCalledTimes(1);
    expect(onAct).not.toHaveBeenCalled();
    rerender(layer([outpost('a', 'Lille')], { holding: false, onAct, onCancelHeld }));
    fireEvent.contextMenu(screen.getByText('Lille'), { button: 2 });
    expect(onAct).toHaveBeenCalledTimes(1);
    expect(onCancelHeld).toHaveBeenCalledTimes(1);
  });
});

/**
 * **Les passagers d'un transport, au survol seulement** (#238) : au repos un petit signe dit leur
 * nombre ; la fiche (planches, « tout débarquer ») s'ouvre au survol, à la sélection, au toucher
 * (`label--pointed`) et sous un glisser qui la vise. Les règles sont celles de `labels.css`,
 * chargées ici : jsdom les applique.
 */
describe('a loaded transport', () => {
  const tag = (): CargoTag => ({
    carrierId: 'truck',
    role: 'landTransport',
    seats: 4,
    used: 1,
    riders: [{ id: 'rider', role: 'infantry', tier: 1, seats: 1 }],
    refusal: null,
    load: { ammunition: 0, oil: 0, coal: 0 },
    loadCapacity: 0,
    tour: null,
  });
  const loaded = { ...outpost('truck', 'Camion'), cargo: [tag()] } as MapLabel;
  const draw = (selected: string | null = null, cargoAim: CargoAim | null = null) => (
    <MapLabels
      labels={[loaded]}
      engine={null}
      selected={selected}
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
      onCancelHeld={noop}
      mapping={CLASSIC_MAPPING}
      holding={false}
      onHoldOver={noop}
      muted={false}
      onDisembark={noop}
      cargoAim={cargoAim}
    />
  );
  const shown = (selector: string) =>
    getComputedStyle(document.querySelector(selector)!).display !== 'none';

  beforeEach(() => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/labels.css', 'utf8');
    document.head.append(style);
  });
  afterEach(() => document.head.querySelector('style')?.remove());

  it('shows a small sign with the passenger count at rest, not the sheet', () => {
    render(draw());
    expect(document.querySelector('.cargo-tag-sign')?.textContent).toBe('1');
    expect(shown('.cargo-tag-sign')).toBe(true);
    expect(shown('.cargo-tag-body')).toBe(false);
  });

  it('opens the sheet under the pointer', () => {
    render(draw());
    document.querySelector('.label-anchor')!.classList.add('label-anchor--hovered');
    expect(shown('.cargo-tag-body')).toBe(true);
    expect(shown('.cargo-tag-sign')).toBe(false);
  });

  it('opens the sheet under a finger', () => {
    render(draw());
    document.querySelector('.label')!.classList.add('label--pointed');
    expect(shown('.cargo-tag-body')).toBe(true);
  });

  it('opens the sheet once the transport is selected', () => {
    render(draw('truck'));
    expect(shown('.cargo-tag-body')).toBe(true);
  });

  it('opens the sheet under a drag that aims at it, to say the seats left', () => {
    render(draw(null, { labelId: 'truck', carrierId: 'truck', need: 1, fits: true }));
    expect(shown('.cargo-tag-body')).toBe(true);
  });
});

/** **Le pied de l'épingle de pose n'est pas caché par la pastille du gisement** (#237) : DOM au
 *  dessus de la toile, la pastille du gisement que tient l'aimant s'estompe. */
describe('the deposit chip under the placement pin', () => {
  const deposit = (id: string, lonLat: [number, number]) =>
    ({
      ...outpost(id, 'charbon'),
      type: 'deposit',
      anchor: { kind: 'ground', lonLat },
    }) as MapLabel;
  const draw = (aimed: [number, number] | null) => (
    <MapLabels
      labels={[deposit('held', [3, 50]), deposit('other', [4, 50])]}
      engine={null}
      selected={null}
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
      onCancelHeld={noop}
      mapping={CLASSIC_MAPPING}
      holding={false}
      onHoldOver={noop}
      muted
      pinAt={aimed}
    />
  );

  it('fades only the chip the pin stands on', () => {
    const { container, rerender } = render(draw([3, 50]));
    const faded = () => [...container.querySelectorAll('.label--under-pin')].length;
    expect(faded()).toBe(1);
    expect(container.querySelector('.label--under-pin')?.textContent).toContain('charbon');
    rerender(draw(null));
    expect(faded()).toBe(0);
  });
});
