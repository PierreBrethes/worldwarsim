// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { BottomSheet } from '@/shell/BottomSheet';
import { bindSpots, placed } from '@/shell/flights';
import { SoleSurfaceProvider, useRoseSurface } from '@/shell/sole-surface';
import { PersonalBoard } from './PersonalBoard';

/**
 * **L'étage des tuiles, sous le seuil** (#589) : une feuille au-dessus de la barre, hors de
 * l'adresse. Deux états — le cran choisi, que l'appareil retient (seuls « replié » et « rang »), et
 * « cédé », éphémère, quand une autre surface tient la place. Il ne réclame rien : ouvrir une
 * feuille ou la rose ne le ferme pas, ne touche pas l'adresse, et il revient tel quel. Une tuile
 * refusée, touchée, ouvre son feuillet ; une tuile courte mais armable s'arme.
 */
const client = {
  watchQuery: () => ({
    localQueryResult: () => undefined,
    onUpdate: () => () => {},
    journal: () => undefined,
  }),
  mutation: () => Promise.resolve(),
} as unknown as ConvexReactClient;

beforeEach(() => {
  // Un appareil neuf arrive replié ; la plupart des cas partent d'un étage que le joueur a relevé.
  localStorage.clear();
  localStorage.setItem('wws-tiles-step', 'peek');
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.animate = () => ({}) as Animation;
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    media: '',
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
});

const SEAT = { token: 't', seasonId: 's' } as unknown as Seat;
const hq = {
  id: 'B-hq',
  key: 'hq',
  name: 'Quartier général',
  regionId: 'FR-NOR',
  point: [3, 50],
  level: 1,
  cappedByHq: false,
  nextLevelCost: { steel: 60, coal: 40 },
  nextLevelMinutes: 1,
};
const stock = (amount: number) => ({ stock: amount, ratePerHour: 4, cap: 1000 });
const viewOf = (mode: 'mondiale' | 'blitz' = 'mondiale'): PlayerView =>
  ({
    loadedAt: 0,
    mode,
    captures: [],
    arcs: [],
    boardRead: null,
    surveyedInstallations: [],
    buildCatalog: new Proxy(
      {},
      {
        get: (_, key) => ({
          minutes: 1,
          cost: { steel: key === 'airfield' ? 100 : 10 },
          lockedBy: key === 'airfield' ? 'aviation' : null,
        }),
      },
    ),
    me: {
      nation: 'france',
      defeated: false,
      troops: [],
      stationedCargo: [],
      construction: null,
      constructionQueue: [],
      recruiting: [],
      regions: [{ id: 'FR-NOR', name: 'Nord', linked: true }],
      buildings: [hq],
      foundation: [],
      extraction: [],
      evacuated: [],
      outposts: [],
      chains: [],
      hqLevel: 1,
      upkeep: {},
      research: { researched: [], running: null, queue: [] },
      resources: {
        ...Object.fromEntries(RESOURCES.map((key) => [key, stock(500)])),
        steel: stock(23),
      },
    },
  }) as unknown as PlayerView;

/** La rose de `WorldMap`, réduite à sa réclamation. */
function Rose({ at, onClose }: { at: boolean; onClose: () => void }) {
  useRoseSurface(at ? {} : null, onClose);
  return at ? <p>rose</p> : null;
}

let setRose: (open: boolean) => void = () => {};
let setSheet: (open: boolean) => void = () => {};
let roseClosed = 0;
const held: string[] = [];
const opened: Array<[boolean, boolean | undefined]> = [];

/** L'étage câblé comme `plateau.tsx` : la fenêtre `personalBoard` n'est que l'adresse du mât. */
function Table({
  view = viewOf(),
  open = false,
  cue = null,
}: {
  view?: PlayerView;
  open?: boolean;
  cue?: ComponentProps<typeof PersonalBoard>['cue'];
}) {
  const [rose, openRose] = useState(false);
  const [sheet, openSheet] = useState(false);
  setRose = openRose;
  setSheet = openSheet;
  return (
    <ConvexProvider client={client}>
      <SoleSurfaceProvider>
        <PersonalBoard
          view={view}
          seat={SEAT}
          open={open}
          onOpen={(next, replace) => opened.push([next, replace])}
          research={false}
          onResearch={() => {}}
          front
          cue={cue}
          focused={null}
          site={null}
          onDeselectSite={() => {}}
          onOpenSiteSheet={() => {}}
          onHoldTile={(key) => key !== null && held.push(key)}
          onPlaceTile={() => false}
          maquetteAt={null}
          placing={null}
        />
        <Rose
          at={rose}
          onClose={() => {
            roseClosed += 1;
            openRose(false);
          }}
        />
        {sheet && (
          <BottomSheet title="Infanterie" onClose={() => openSheet(false)}>
            <p>fiche</p>
          </BottomSheet>
        )}
      </SoleSurfaceProvider>
    </ConvexProvider>
  );
}

const stage = () => document.querySelector<HTMLElement>('[data-stage]')!;
const step = () => stage().dataset.height;
/** A finger pulls the stage: negative is up. */
const pull = (travel: number) =>
  act(() => {
    stage().firstElementChild!.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }),
    );
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 + travel }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 + travel }));
  });
const hidden = () => stage().style.visibility === 'hidden';
const toggle = () =>
  screen.getByRole('button', { name: /le plateau personnel$/, hidden: true }) as HTMLElement;
const tile = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name} — `), hidden: true });

describe("the tiles' stage under the threshold", () => {
  it('comes out folded on its title line on the first launch, out of the address (#621)', () => {
    localStorage.clear();
    render(<Table />);
    expect(step()).toBe('collapsed');
    expect(hidden()).toBe(false);
    expect(localStorage.getItem('wws-tiles-step')).toBeNull();
  });

  it('says the lit step on the title line while folded, and drops the bubble (#621)', () => {
    localStorage.clear();
    const cue = { text: 'Pose une ferme', tile: 'farm' as const, rack: 'tiles' as const };
    render(<Table cue={cue} />);
    expect(stage().querySelector('h2')!.parentElement!.textContent).toContain(cue.text);
    expect(stage().querySelector('.first-step-cue')).toBeNull();
    act(() => toggle().click());
    expect(step()).toBe('peek');
    expect(stage().querySelector('.first-step-cue')).not.toBeNull();
    expect(stage().textContent).toContain(cue.text);
  });

  it('keeps the works on the title line while folded and no step is lit', () => {
    localStorage.clear();
    render(<Table />);
    expect(stage().textContent).toContain(fr.personalBoard.noWorks);
  });

  it('keeps « folded » and « row » from one launch to the next, and nothing taller', () => {
    localStorage.setItem('wws-tiles-step', 'collapsed');
    render(<Table />);
    expect(step()).toBe('collapsed');
    cleanup();
    localStorage.setItem('wws-tiles-step', 'peek');
    render(<Table />);
    expect(step()).toBe('peek');
    cleanup();
    localStorage.setItem('wws-tiles-step', 'half');
    render(<Table />);
    expect(step()).toBe('collapsed');
  });

  it('remembers the step the player chose', () => {
    render(<Table />);
    act(() => toggle().click());
    expect(step()).toBe('collapsed');
    expect(localStorage.getItem('wws-tiles-step')).toBe('collapsed');
    act(() => toggle().click());
    expect(step()).toBe('peek');
    expect(localStorage.getItem('wws-tiles-step')).toBe('peek');
    // The half and the full are the volet's: choosing them writes nothing.
    for (const height of ['half', 'full']) {
      pull(-120);
      expect(step()).toBe(height);
      expect(localStorage.getItem('wws-tiles-step')).toBe('peek');
    }
  });

  it('is ceded to a sheet, claims nothing, and comes back as it was', () => {
    localStorage.setItem('wws-tiles-step', 'collapsed');
    render(<Table open />);
    expect(step()).toBe('peek');
    act(() => toggle().click());
    expect(step()).toBe('collapsed');
    act(() => setSheet(true));
    expect(hidden()).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Infanterie' })).toBeTruthy();
    act(() => screen.getByRole('button', { name: fr.common.close }).click());
    expect(hidden()).toBe(false);
    expect(step()).toBe('collapsed');
  });

  it('is ceded to the rose without closing it, and leaves it to its own closing', () => {
    roseClosed = 0;
    render(<Table />);
    act(() => setRose(true));
    expect(hidden()).toBe(true);
    expect(roseClosed).toBe(0);
    expect(screen.getByText('rose')).toBeTruthy();
    act(() => setSheet(true));
    expect(roseClosed).toBe(1);
    expect(hidden()).toBe(true);
  });

  it('comes out of its bar when a mast opens the board, and folding it closes that window', () => {
    opened.length = 0;
    localStorage.setItem('wws-tiles-step', 'collapsed');
    const { rerender } = render(<Table />);
    expect(step()).toBe('collapsed');
    rerender(<Table open />);
    expect(step()).toBe('peek');
    act(() => toggle().click());
    // Out of the history: Back must not bring the window, then the row, back.
    expect(opened).toEqual([[false, true]]);
  });

  it('gives the focus back to its grip when the surface that took the place closes', () => {
    render(<Table />);
    const grip = toggle();
    grip.focus();
    act(() => setSheet(true));
    // What the browser does to a hidden node.
    act(() => grip.blur());
    expect(document.activeElement).toBe(document.body);
    act(() => screen.getByRole('button', { name: fr.common.close }).click());
    expect(document.activeElement).toBe(grip);
  });

  it('has no stage in a Blitz', () => {
    render(<Table view={viewOf('blitz')} />);
    expect(document.querySelector('[data-stage]')).toBeNull();
    expect(screen.getByRole('region', { name: fr.footBar.label })).toBeTruthy();
  });
});

describe('a refused tile', () => {
  it('opens its sheet, with the refusal said whole and each matter against the stock', async () => {
    render(<Table />);
    fireEvent.click(tile(fr.buildings.airfield));
    const sheet = await screen.findByLabelText(fr.personalBoard.refusalOf(fr.buildings.airfield));
    expect(sheet.textContent).toContain(fr.errors.RESEARCH_REQUIRED({ card: 'aviation' }));
    expect(sheet.textContent).toContain('/ 100');
    act(() => screen.getByRole('button', { name: fr.personalBoard.refusalClose }).click());
    expect(screen.queryByLabelText(fr.personalBoard.refusalOf(fr.buildings.airfield))).toBeNull();
  });

  it('is not opened by a short but armable tile, which arms at the touch', async () => {
    held.length = 0;
    render(<Table />);
    fireEvent.click(tile('Quartier général'));
    expect(held).toEqual(['hq']);
    await act(async () => {});
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('goes when another surface takes the place and closes, and says its state', async () => {
    render(<Table />);
    fireEvent.click(tile(fr.buildings.airfield));
    const label = fr.personalBoard.refusalOf(fr.buildings.airfield);
    expect((await screen.findByLabelText(label)).getAttribute('role')).toBe('status');
    act(() => setSheet(true));
    act(() => screen.getByRole('button', { name: fr.common.close }).click());
    expect(screen.queryByLabelText(label)).toBeNull();
  });

  it('goes with the stage when it folds', async () => {
    render(<Table />);
    fireEvent.click(tile(fr.buildings.airfield));
    await screen.findByLabelText(fr.personalBoard.refusalOf(fr.buildings.airfield));
    act(() => toggle().click());
    expect(screen.queryByLabelText(fr.personalBoard.refusalOf(fr.buildings.airfield))).toBeNull();
  });
});

/** Where `placed` sends the tile: the last frame of its flight, read back as a centre. */
const flights: Array<{ className: string; frames: Array<{ transform: string }> }> = [];
const recordFlights = () => {
  flights.length = 0;
  Element.prototype.animate = function (this: Element, frames: unknown) {
    flights.push({ className: this.className, frames: frames as Array<{ transform: string }> });
    return { finished: new Promise(() => {}) } as unknown as Animation;
  };
};
const arrival = () => {
  const frames = flights.find((one) => one.className === 'placed-tile')?.frames;
  const [, x, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(frames!.at(-1)!.transform)!;
  const box = document.querySelector<HTMLElement>('.placed-tile')!.style;
  return { x: Number(x) + parseFloat(box.width) / 2, y: Number(y) + parseFloat(box.height) / 2 };
};
const rectOf = (left: number, top: number, width: number, height: number) =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect;

describe("the pose's flight on the phone (#592)", () => {
  let unbind = () => {};
  beforeEach(() => {
    recordFlights();
    unbind = bindSpots({ onMap: () => ({ x: 200, y: 300 }) });
  });
  afterEach(() => {
    unbind();
    document.body
      .querySelectorAll('.pointer-events-none.fixed.inset-0')
      .forEach((node) => node.remove());
  });

  it("files the tile taken on its stage on the stage's title line, at the size it had", () => {
    render(<Table />);
    const bar = screen.getByRole('region', { name: fr.footBar.label });
    bar.getBoundingClientRect = () => rectOf(0, 800, 390, 44);
    document.querySelector<HTMLElement>('[data-stage] h2')!.getBoundingClientRect = () =>
      rectOf(0, 640, 200, 20);
    const taken = tile('Quartier général');
    taken.getBoundingClientRect = () => rectOf(10, 700, 60, 50);
    fireEvent.click(taken);
    placed('hq', [3, 50], 'full');
    expect(arrival()).toEqual({ x: 100, y: 650 });
    expect(document.querySelector('.placed-tile')).toHaveProperty('style.width', '44px');
  });

  it("still files it on the stage's title line when the stage shows its works tab", () => {
    render(<Table />);
    const bar = screen.getByRole('region', { name: fr.footBar.label });
    bar.getBoundingClientRect = () => rectOf(0, 800, 390, 44);
    pull(-120);
    document.querySelector<HTMLElement>('[data-volet-column="works"]')!.getBoundingClientRect =
      () => rectOf(0, 300, 390, 300);
    document.querySelector<HTMLElement>('[data-stage] h2')!.getBoundingClientRect = () =>
      rectOf(0, 640, 200, 20);
    const taken = tile('Quartier général');
    taken.getBoundingClientRect = () => rectOf(10, 700, 60, 50);
    fireEvent.click(taken);
    placed('hq', [3, 50], 'full');
    expect(arrival()).toEqual({ x: 100, y: 650 });
  });

  it('leaves the ring alone when the stage is ceded', () => {
    render(<Table />);
    fireEvent.click(tile('Quartier général'));
    act(() => setSheet(true));
    placed('hq', [3, 50], 'full');
    expect(document.querySelector('.recharge-pulse')).not.toBeNull();
    expect(document.querySelector('.placed-tile')).toBeNull();
  });
});
