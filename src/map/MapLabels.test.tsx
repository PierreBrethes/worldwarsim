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
  const tag = (over: Partial<CargoTag> = {}): CargoTag => ({
    carrierId: 'truck',
    role: 'landTransport',
    seats: 4,
    used: 1,
    riders: [{ id: 'rider', role: 'infantry', tier: 1, seats: 1 }],
    refusal: null,
    load: { ammunition: 0, oil: 0, coal: 0 },
    loadCapacity: 0,
    tour: null,
    ...over,
  });
  const draw = ({
    cargo = tag(),
    selected = null,
    cargoAim = null,
    carriersShown = false,
    label = {},
    openStation = null,
  }: {
    label?: Partial<MapLabel>;
    openStation?: string | null;
    cargo?: CargoTag;
    selected?: string | null;
    cargoAim?: CargoAim | null;
    carriersShown?: boolean;
  } = {}) => (
    <MapLabels
      labels={[{ ...outpost('truck', 'Camion'), cargo: [cargo], ...label } as MapLabel]}
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
      carriersShown={carriersShown}
      openStation={openStation}
    />
  );
  const shown = (selector: string) =>
    getComputedStyle(document.querySelector(selector)!).display !== 'none';

  beforeEach(() => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/labels.css', 'utf8');
    document.head.append(style);
  });
  afterEach(() => {
    document.head.querySelector('style')?.remove();
    vi.useRealTimers();
  });

  it('shows a small sign with a rifleman mark and the count at rest, not the sheet', () => {
    render(draw());
    const sign = document.querySelector('.cargo-tag-sign')!;
    expect(sign.textContent).toContain('1');
    expect(sign.querySelector('img, .cargo-tag-mark')).not.toBeNull();
    expect(sign.getAttribute('title')).toBeTruthy();
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
    render(draw({ selected: 'truck' }));
    expect(shown('.cargo-tag-body')).toBe(true);
  });

  it('opens the sheet under a drag that aims at it, to say the seats left', () => {
    render(draw({ cargoAim: { labelId: 'truck', carrierId: 'truck', need: 1, fits: true } }));
    expect(shown('.cargo-tag-body')).toBe(true);
  });

  /** **Charger des jetons** (ADR 0028 §4) : `TokenDrag` cherche `[data-carrier-id]` sous la main ;
   *  le corps de l'étiquette est ce qu'il trouve, il doit donc être là. */
  it('keeps its body under the hand while tokens are carried', () => {
    render(draw({ carriersShown: true }));
    expect(shown('.cargo-tag-body')).toBe(true);
    expect(shown('.cargo-tag-sign')).toBe(false);
  });

  it('is still seen at rest when it only carries a tour or a load', () => {
    const { unmount } = render(
      draw({
        cargo: tag({ riders: [], used: 0, tour: { state: 'running', stops: 2, waiting: null } }),
      }),
    );
    expect(document.querySelector('.cargo-tag-sign')).not.toBeNull();
    expect(shown('.cargo-tag-body')).toBe(false);
    unmount();
    render(
      draw({
        cargo: tag({
          riders: [],
          used: 0,
          load: { ammunition: 10, oil: 0, coal: 0 },
          loadCapacity: 50,
        }),
      }),
    );
    expect(document.querySelector('.cargo-tag-sign')).not.toBeNull();
  });

  it('keeps the sheet of a stuck tour open at rest: an order is waiting', () => {
    render(
      draw({
        cargo: tag({
          riders: [],
          used: 0,
          tour: { state: 'waiting', stops: 2, waiting: { why: 'full' } },
        }),
      }),
    );
    expect(shown('.cargo-tag-body')).toBe(true);
  });

  /** **Un transport rangé à un avant-poste** : son étiquette est celle de l'avant-poste, que rien
   *  ne « sélectionne » ; la fiche s'ouvre avec la fenêtre de garnison de cette adresse. */
  it('opens the sheet of a transport stored at a site while that site is open', () => {
    const stored = { station: { kind: 'outpost', outpostId: 'o1' } } as Partial<MapLabel>;
    const { unmount } = render(draw({ label: stored }));
    expect(shown('.cargo-tag-body')).toBe(false);
    unmount();
    render(draw({ label: stored, openStation: 'outpost:o2' }));
    expect(shown('.cargo-tag-body')).toBe(false);
    cleanup();
    render(draw({ label: stored, openStation: 'outpost:o1' }));
    expect(shown('.cargo-tag-body')).toBe(true);
  });

  it('can be reached: the sign takes the pointer, and the sheet waits before it folds', () => {
    vi.useFakeTimers();
    render(draw());
    expect(getComputedStyle(document.querySelector('.cargo-tag-sign')!).pointerEvents).toBe('auto');
    const label = document.querySelector('.label')!;
    const anchor = document.querySelector('.label-anchor')!;
    fireEvent.pointerEnter(label);
    expect(anchor.classList.contains('label-anchor--hovered')).toBe(true);
    fireEvent.pointerLeave(label);
    expect(anchor.classList.contains('label-anchor--hovered')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(anchor.classList.contains('label-anchor--hovered')).toBe(false);
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
