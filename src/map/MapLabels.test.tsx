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
import { NameSheet } from './map-names';

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
  // jsdom has no font set, and the names' sheet waits there for a face to land (`NameSheet`).
  Object.defineProperty(document, 'fonts', {
    value: { status: 'loaded', addEventListener: () => {}, removeEventListener: () => {} },
    configurable: true,
  });
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

  /** **Le survol se tait pièce en main** (ADR 0026 §6, #619) : la fiche latérale parle, la carte de
   *  survol de la pile en main ne s'ouvre pas ; sans pièce, elle s'ouvre. */
  it('opens no press card on a hovered pile while a piece is in hand', () => {
    const card = vi.fn(() => <p>affiche</p>);
    const withCard = (holding: boolean) => (
      <MapLabels
        {...layer([outpost('a', 'Lille')], { holding, onAct: noop, onCancelHeld: noop }).props}
        poster={card}
      />
    );
    const { rerender } = render(withCard(true));
    fireEvent.pointerEnter(document.querySelector('.label')!);
    fireEvent.pointerOver(document.querySelector('.label')!);
    expect(screen.queryByText('affiche')).toBeNull();
    rerender(withCard(false));
    fireEvent.pointerOver(document.querySelector('.label')!);
    fireEvent.pointerEnter(document.querySelector('.label')!);
    expect(screen.queryByText('affiche')).not.toBeNull();
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

/** **Un des Sept est son mât de la toile** (#683) : l'étiquette ne dessine plus de fanion, ne
 *  prend plus le pointeur et ne joue plus la descente du drapeau (elle passe à la flamme, #682). */
describe('the label of a strategic point', () => {
  const mast = (ink: string | null) =>
    ({ ...outpost('narvik', 'Narvik'), type: 'strategic', pictogram: null, ink }) as MapLabel;
  const root = () => document.querySelector('[data-label-id="narvik"]')!;

  it('is a pinned label with no flag of its own', () => {
    render(layer([mast('#a83f68')]));
    expect(root().className).toContain('label--pinned');
    expect(root().querySelector('.label-pictogram')).toBeNull();
  });

  /** The mast has no pin (`markerPin` serves none): a label that gives way to its pin from
   *  d ≈ 17 would leave its cartouche nowhere at the Europe and world zoom. */
  it('is never sent to the engine as pinned, its cartouche stays at every zoom', () => {
    const sent: Array<{ id: string; pinned?: boolean }> = [];
    const engine = {
      setLabelAnchors: (anchors: typeof sent) => sent.push(...anchors),
      subscribeRest: () => () => {},
      atZoomFloor: () => false,
      invalidate: () => {},
      nameSpots: () => ({ cities: [], rivers: [], seas: [], pins: [], night: 0 }),
      pieceRect: () => null,
      cameraDistance: () => 100,
      heldRects: () => [],
    };
    render(
      <MapLabels
        {...(layer([mast('#a83f68')]).props as React.ComponentProps<typeof MapLabels>)}
        engine={engine as never}
      />,
    );
    expect(sent.find(({ id }) => id === 'narvik')?.pinned).toBe(false);
  });

  it('plays no swap when the point changes hands', () => {
    const { rerender } = render(layer([mast('#a83f68')]));
    rerender(layer([mast('#2b6974')]));
    expect(root().className).not.toMatch(/label--flag/);
  });
});

/** **Un objectif neutre est sa maquette ou son signe, jamais les deux** (#537) : de près, son
 *  coffre cède à la maquette comme son mât, au même poids (`--dressed`). */
describe('a neutral objective in maquette', () => {
  /** jsdom drops `calc(var())`: the rules that give way by `--dressed` are read in the sheet. */
  const givingWay = [
    ...readFileSync('src/styles/labels.css', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/([^{}]+)\{\s*opacity: calc\(1 - var\(--dressed, 0\)\);\s*\}/g),
  ].flatMap(([, selectors]) => selectors!.split(',').map((selector) => selector.trim()));

  it('gives its chest way to the maquette as its mast does', () => {
    const objective = {
      ...outpost('objective-o', 'réserves abandonnées'),
      type: 'objective',
      pictogram: 'objective',
    } as MapLabel;
    const { container } = render(layer([objective]));
    const giving = (part: string) =>
      givingWay.some((selector) => container.querySelector(selector)?.matches(part) === true);
    expect(giving('.label-bar')).toBe(true);
    expect(giving('.label-pictogram')).toBe(true);
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
    harvest: { food: 0, steel: 0, coal: 0, oil: 0, ammunition: 0 },
    loadCapacity: 0,
    tour: null,
    ...over,
  });
  const draw = ({
    cargo = tag(),
    selected = null,
    cargoAim = null,
    carriersShown = false,
    heldLabel = null,
    label = {},
    openStation = null,
  }: {
    heldLabel?: string | null;
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
      heldLabel={heldLabel}
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

  /** **La pile en main parle par sa fiche** (#619) : au bureau, sa bulle se tait, les autres restent
   *  des cibles de dépôt ; au téléphone, la bulle est la seule porte de la feuille de route. */
  it('hangs no tag on the pile in hand at the desk, while the others keep theirs', () => {
    render(draw({ heldLabel: 'truck' }));
    expect(document.querySelector('.cargo-tag-sign')).toBeNull();
    cleanup();
    render(draw({ heldLabel: 'another' }));
    expect(document.querySelector('.cargo-tag-sign')).not.toBeNull();
  });

  it('keeps the tag of the pile in hand on a phone', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(draw({ heldLabel: 'truck' }));
    expect(document.querySelector('.cargo-tag-sign')).not.toBeNull();
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

  /** #445 : le nom s'écrit sous le bassin, mais la maquette bâtie dessus a un socle plus large. */
  it('hangs its name below the building that stands on it, not under its plinth', () => {
    const engine: Record<string, unknown> = {
      setLabelAnchors: () => {},
      subscribeRest: () => () => {},
      atZoomFloor: () => false,
      invalidate: () => {},
      nameSpots: () => ({ cities: [], rivers: [], seas: [], pins: [], night: 0 }),
      pieceRect: (id: string) =>
        id === 'building-mine@3,50' ? { left: 700, right: 860, top: 160, bottom: 269 } : null,
      cameraDistance: () => 20,
      heldRects: () => [],
    };
    const worked = { ...deposit('held', [3, 50]), clears: 'building-mine@3,50' } as MapLabel;
    render(
      <MapLabels
        labels={[worked, deposit('free', [4, 50])]}
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
        muted
      />,
    );
    const project = (id: string) => ({
      id,
      visible: true,
      x: 796,
      y: 246,
      lod: 'expanded',
      fade: 1,
      dressed: 0,
      far: false,
      drawnX: 0,
      drawnY: 0,
      distance: 20,
      atEdge: false,
      edgeX: 0,
      edgeY: 0,
      heading: 0,
    });
    act(() =>
      (engine.onLabels as (projections: ReadonlyArray<unknown>) => void)([
        project('held'),
        project('free'),
      ]),
    );
    const at = (id: string) =>
      (document.querySelector(`[data-label-id="${id}"]`)?.parentElement as HTMLElement).style
        .transform;
    expect(at('held')).toBe('translate3d(796px, 269px, 0)');
    expect(at('free')).toBe('translate3d(796px, 246px, 0)');
  });
});

/** #279 : un site tenu le temps que son drapeau descend n'a plus d'étiquette, mais les noms du
 *  décor s'écartent de sa maquette. */
describe('the decor names, round a site held while its flag comes down', () => {
  it('stand clear of its rect, which the engine serves as held', () => {
    const held = { left: 700, right: 860, top: 160, bottom: 269 };
    const paint = vi.spyOn(NameSheet.prototype, 'paint').mockImplementation(() => {});
    const engine: Record<string, unknown> = {
      setLabelAnchors: () => {},
      subscribeRest: () => () => {},
      atZoomFloor: () => false,
      invalidate: () => {},
      nameSpots: () => ({ cities: [], rivers: [], seas: [], pins: [], night: 0 }),
      pieceRect: () => null,
      cameraDistance: () => 20,
      heldRects: () => [held],
    };
    render(
      <MapLabels
        labels={[]}
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
        muted
      />,
    );
    act(() => (engine.onLabels as (projections: ReadonlyArray<unknown>) => void)([]));
    expect(paint).toHaveBeenCalled();
    expect(paint.mock.calls.at(-1)?.[1]).toContainEqual(held);
    paint.mockRestore();
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
      nameSpots: () => ({ cities: [], rivers: [], seas: [], pins: [], night: 0 }),
      pieceRect: () => null,
      cameraDistance: () => 20,
      heldRects: () => [],
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

describe('the interface zoom under a round of degradation (#560)', () => {
  /** **Un tour lit le `zoom` une fois** : chaque classe écrite entre deux lectures refait le calcul
   *  de style, et la première passe le faisait une fois par étiquette (120 à 170 ms sur mille). */
  it('is read once, not once per label', () => {
    vi.useFakeTimers();
    const reads = vi.spyOn(window, 'getComputedStyle');
    const labels = Array.from({ length: 40 }, (_, i) => outpost(`o${i}`, `Ville ${i}`));
    render(layer(labels));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Only the labels' own reads: the test's helpers read other nodes.
    const zoomReads = reads.mock.calls.filter(([node]) => node.classList.contains('label'));
    expect(zoomReads.length).toBeLessThanOrEqual(1);
    reads.mockRestore();
    vi.useRealTimers();
  });
});

/** **L'étiquette de la visée** (#586) : montée dans la carte, avec la feuille de style du jeu. */
describe('the aim label of a finger', () => {
  const aim = {
    ...outpost('gate-aim', 'Marcher → près de Bourges'),
    type: 'course-mark',
  } as MapLabel;
  const engineOf = (): Record<string, unknown> => ({
    setLabelAnchors: () => {},
    subscribeRest: () => () => {},
    atZoomFloor: () => false,
    invalidate: () => {},
    nameSpots: () => ({ cities: [], rivers: [], seas: [], pins: [], night: 0 }),
    pieceRect: () => null,
    cameraDistance: () => 20,
    heldRects: () => [],
  });
  const mount = (engine: Record<string, unknown> | null = null) =>
    render(
      <MapLabels
        labels={[aim]}
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
      />,
    );
  const fadeNow = () =>
    getComputedStyle(document.querySelector('[data-label-id="gate-aim"] .label-lines')!).animation;

  beforeEach(() => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/styles/labels.css', 'utf8');
    document.head.append(style);
  });
  afterEach(() => {
    document.head.querySelector('style')?.remove();
    delete document.documentElement.dataset.motion;
    vi.restoreAllMocks();
  });

  it('fades in under full motion, and not under reduced or off', () => {
    mount();
    document.documentElement.dataset.motion = 'full';
    expect(fadeNow()).toContain('aim-label-in');
    for (const motion of ['reduced', 'off']) {
      document.documentElement.dataset.motion = motion;
      expect(fadeNow()).toBe('none');
    }
  });

  it('shifts left, 8 px short of the edge, when the point is at the right edge', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 20),
    );
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const engine = engineOf();
    mount(engine);
    const project = (x: number) => ({
      id: 'gate-aim',
      visible: true,
      x,
      y: 300,
      lod: 'expanded',
      fade: 1,
      dressed: 0,
      far: false,
      drawnX: 0,
      drawnY: 0,
      distance: 20,
      atEdge: false,
      edgeX: 0,
      edgeY: 0,
      heading: 0,
    });
    const anchor = () => document.querySelector('[data-label-id="gate-aim"]')!.parentElement!;
    act(() => (engine.onLabels as (projections: ReadonlyArray<unknown>) => void)([project(370)]));
    expect(anchor().style.getPropertyValue('--aim-shift')).toBe('-88px');
    act(() => (engine.onLabels as (projections: ReadonlyArray<unknown>) => void)([project(195)]));
    expect(anchor().style.getPropertyValue('--aim-shift')).toBe('0px');
  });
});

/** **Le chiffre du tas posé sur le tas** (#707) : de près, sur le haut du tas que la maquette
 *  dessine dans sa cour ; de loin, contre le socle ou le point, comme avant. */
describe('the number of my heap', () => {
  const heaped = {
    ...outpost('building-mine@3,50', 'Mine de fer'),
    type: 'building',
    heap: {
      resource: 'steel',
      amount: 77,
      cap: 192,
      perHour: 0,
      asOf: 0,
      fullSince: null,
      foundation: null,
    },
  } as MapLabel;
  const placed = (heapPoint: { x: number; y: number } | null) => {
    const engine: Record<string, unknown> = {
      setLabelAnchors: () => {},
      subscribeRest: () => () => {},
      atZoomFloor: () => false,
      invalidate: () => {},
      nameSpots: () => ({ cities: [], rivers: [], seas: [], pins: [], night: 0 }),
      pieceRect: () => ({ left: 700, right: 860, top: 160, bottom: 269 }),
      heapPoint: () => heapPoint,
      cameraDistance: () => 20,
      heldRects: () => [],
    };
    render(
      <MapLabels
        {...(layer([heaped]).props as React.ComponentProps<typeof MapLabels>)}
        engine={engine as never}
      />,
    );
    act(() =>
      (engine.onLabels as (projections: ReadonlyArray<unknown>) => void)([
        {
          id: 'building-mine@3,50',
          visible: true,
          x: 796,
          y: 246,
          lod: 'expanded',
          fade: 1,
          dressed: 1,
          far: false,
          drawnX: 0,
          drawnY: 0,
          distance: 20,
          atEdge: false,
          edgeX: 0,
          edgeY: 0,
          heading: 0,
        },
      ]),
    );
    const anchor = document.querySelector('[data-label-id="building-mine@3,50"]')!
      .parentElement as HTMLElement;
    return ['--heap-x', '--heap-y', '--heap-shift', '--heap-lift'].map((name) =>
      anchor.style.getPropertyValue(name),
    );
  };

  it('sits on the top of the heap drawn in the yard, its middle over it', () => {
    expect(placed({ x: 820, y: 200 })).toEqual(['24px', '-50px', '-50%', '-100%']);
  });

  it('keeps to the corner of the socle without a heap drawn', () => {
    expect(placed(null)).toEqual(['68px', '17px', '0%', '-100%']);
  });
});
