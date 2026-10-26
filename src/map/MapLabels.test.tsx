// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

/** **Un gisement est son bassin et son nom à l'encre** (#239) : plus de pastille sur la carte,
 *  rien donc à estomper sous l'épingle de pose (#237), qui reste lisible sur le bassin. */
describe('a deposit on the map', () => {
  const deposit = (id: string, lonLat: [number, number]) =>
    ({
      ...outpost(id, 'charbon'),
      type: 'deposit',
      anchor: { kind: 'ground', lonLat },
    }) as MapLabel;
  const draw = () => (
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
    />
  );

  it('wears no chip that would hide the pin', () => {
    const { container } = render(draw());
    expect(container.querySelector('.label-deposit')).toBeNull();
    expect(container.querySelector('.label--deposit img')).toBeNull();
    expect(container.querySelector('.label--deposit')?.textContent).toContain('charbon');
  });
});

/**
 * **Un anneau de bâtiments garde son « N sites » quand la pile au centre est en figurines**
 * (#285). La figurine plancher laisse la pile lisible jusqu'à d ≈ 30 : son étiquette, qui
 * passe avant celle des bâtiments, ne doit plus replier leur cartouche réuni.
 */
describe('a ring of buildings around a stack', () => {
  const place = (id: string, type: 'stack' | 'building', priority: number) =>
    ({
      ...outpost(id, id),
      type,
      priority,
      lines: [{ role: 'nature', text: id }],
      force: type === 'stack' ? { headcount: 4 } : null,
    }) as unknown as MapLabel;

  const truck = {
    ...place('truck', 'stack', 0),
    type: 'outpost',
    cargo: [
      {
        carrierId: 'truck',
        role: 'landTransport',
        seats: 4,
        used: 1,
        riders: [{ id: 'rider', role: 'infantry', tier: 1, seats: 1 }],
        refusal: null,
        load: { ammunition: 0, oil: 0, coal: 0 },
        loadCapacity: 0,
        tour: null,
      },
    ],
  } as unknown as MapLabel;
  const labels = [
    place('stack', 'stack', 5),
    place('hq', 'building', 1),
    place('airfield', 'building', 1),
    place('barracks', 'building', 1),
    truck,
  ];

  const frame = (engine: Record<string, unknown>) => (
    <MapLabels
      labels={labels}
      engine={engine as never}
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
      muted={false}
      onDisembark={noop}
    />
  );

  /** Every label stands at the same screen point, as a region's stack and its buildings do. */
  const lay = (cartouche: 'reading' | 'quiet', top = 100, sheet = false) => {
    const engine: Record<string, unknown> = {
      setLabelAnchors: () => {},
      subscribeRest: () => () => {},
      atZoomFloor: () => false,
      invalidate: () => {},
      pieceRect: () => null,
      cameraDistance: () => 20,
    };
    // A real DOMRect keeps its edges as prototype accessors, which `{ ...box }` drops. At rest a
    // stack's cartouche is quiet: measured, it has no area.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      // A cargo sheet open over the ring's mast (`.cargo-tag-body`), when asked for.
      if (this.matches('.cargo-tag-body'))
        return sheet ? new DOMRect(90, top - 60, 100, 40) : new DOMRect(0, 0, 0, 0);
      return new DOMRect(100, top, ...(cartouche === 'reading' ? [60, 20] : [0, 0]));
    });
    const frames: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
    render(frame(engine));
    const project = (id: string, dressed: number) => ({
      id,
      visible: true,
      x: 130,
      y: 120,
      lod: 'expanded',
      fade: 1,
      dressed,
      far: false,
      drawnX: 0,
      drawnY: 0,
      distance: 20,
      atEdge: false,
      edgeX: 0,
      edgeY: 0,
      heading: 0,
    });
    const onLabels = engine.onLabels as (projections: ReadonlyArray<unknown>) => void;
    const projections = labels.map((label) => project(label.id, 1));
    // One frame sets the states and asks for the degradation, the next one places the groups.
    act(() => onLabels(projections));
    act(() => frames.splice(0).forEach((run) => run()));
    act(() => onLabels(projections));
  };

  const sites = () =>
    [...document.querySelectorAll('.label--building-group')].find((node) =>
      node.textContent?.includes('3 sites'),
    );
  const shownGroup = () => {
    const anchor = sites()?.parentElement;
    return anchor != null && anchor.style.display !== 'none';
  };

  afterEach(() => vi.restoreAllMocks());

  it('keeps its "3 sites" beside a quiet stack cartouche, with nothing to clear', () => {
    lay('quiet');
    expect(shownGroup()).toBe(true);
    expect((sites() as HTMLElement).style.getPropertyValue('--label-stagger')).toBe('0px');
  });

  it('rises above a stack cartouche that reads, instead of covering it', () => {
    lay('reading');
    expect(shownGroup()).toBe(true);
    const lift = (sites() as HTMLElement).style.getPropertyValue('--label-stagger');
    // The stack's cartouche is 20 px high here: the ring's mast is longer by at least that.
    expect(Number.parseInt(lift)).toBeGreaterThanOrEqual(20);
  });

  it('folds as before when the mast it needs would leave the screen', () => {
    lay('reading', 5);
    expect(shownGroup()).toBe(false);
  });

  it('folds as before when the mast it needs would land in a cargo sheet', () => {
    lay('reading', 100, true);
    expect(shownGroup()).toBe(false);
  });
});
