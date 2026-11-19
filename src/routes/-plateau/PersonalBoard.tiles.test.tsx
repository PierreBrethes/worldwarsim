// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { bindSpots, placed } from '@/shell/flights';
import { PersonalBoard } from './PersonalBoard';

/**
 * **Au bureau, les tuiles se tiennent debout dans la barre** (#579) : plateau replié, elles sont
 * là ; une matière qui manque s'écrit « stock/prix » sur la tuile, et sa phrase se dit à la tuile
 * levée et dans son nom. Le refus de placement passe avant le manque.
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
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('hover') || query.includes('pointer'),
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
afterEach(cleanup);

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
const stock = (amount: number) => ({ stock: amount, ratePerHour: 0, cap: 1000 });
const view = {
  loadedAt: 0,
  mode: 'mondiale',
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
} as unknown as PlayerView;

const mount = (open = false) =>
  render(
    <ConvexProvider client={client}>
      <PersonalBoard
        view={view}
        seat={SEAT}
        open={open}
        onOpen={() => {}}
        research={false}
        onResearch={() => {}}
        front
        focused={null}
        site={null}
        onDeselectSite={() => {}}
        onOpenSiteSheet={() => {}}
        onHoldTile={() => {}}
        onPlaceTile={() => false}
        maquetteAt={null}
        placing={null}
      />
    </ConvexProvider>,
  );

const tile = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} — `) });

describe('the tiles standing in the desk bar', () => {
  it('stand while the board is folded', () => {
    mount();
    expect(tile('Quartier général').closest('[inert]')).toBeNull();
  });

  it("are named by the hover wording at the desk, the touch wording being the phone's", () => {
    mount();
    expect(screen.getByRole('group', { name: fr.personalBoard.tilesNote })).toBeTruthy();
  });

  it('write a short matter as stock over price, in red, and only that one', () => {
    mount();
    const price = within(tile('Quartier général')).getByText('23/60');
    expect(price.style.color).toBe('var(--critical)');
    expect(within(tile('Quartier général')).queryByText('500/40')).toBeNull();
  });

  it('say the shortage when lifted and in their name, and keep their solid frame', () => {
    mount();
    const short = tile('Quartier général');
    expect(short.getAttribute('aria-label')).toContain('il manque 37 acier');
    expect(short.className).not.toContain('border-dashed');
    expect(within(short).getAllByText(/il manque 37 acier/).length).toBeGreaterThan(0);
  });

  it('say their placement refusal before any shortage', () => {
    mount();
    const refused = tile(fr.buildings.airfield);
    expect(refused.getAttribute('aria-label')).toContain(
      fr.errors.RESEARCH_REQUIRED({ card: 'aviation' }),
    );
    expect(refused.getAttribute('aria-label')).not.toContain('il manque');
    expect(refused.className).toContain('border-dashed');
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

describe("the pose's flight at the desk (#592)", () => {
  let unbind = () => {};
  beforeEach(() => {
    recordFlights();
    unbind = bindSpots({ onMap: () => ({ x: 600, y: 300 }) });
  });
  afterEach(() => {
    unbind();
    document.body
      .querySelectorAll('.pointer-events-none.fixed.inset-0')
      .forEach((node) => node.remove());
  });
  const board = () => screen.getByRole('region', { name: fr.personalBoard.header });
  const take = () => {
    const taken = tile('Quartier général');
    taken.getBoundingClientRect = () => rectOf(400, 820, 60, 50);
    fireEvent.click(taken);
  };

  it("files the tile on the volet's queue when it is open", () => {
    mount(true);
    board().getBoundingClientRect = () => rectOf(0, 800, 1440, 77);
    const queue = document.querySelector<HTMLElement>('[data-volet-column="works"]')!;
    queue.getBoundingClientRect = () => rectOf(100, 500, 372, 300);
    take();
    placed('hq', [3, 50], 'full');
    expect(arrival()).toEqual({ x: 286, y: 650 });
  });

  it('files it on the bar when the volet is folded', () => {
    mount(false);
    board().getBoundingClientRect = () => rectOf(0, 800, 1440, 77);
    // Folded, the column keeps its box under the clip: only its inertness says it is hidden.
    document.querySelector<HTMLElement>('[data-volet-column="works"]')!.getBoundingClientRect =
      () => rectOf(100, 500, 372, 300);
    take();
    placed('hq', [3, 50], 'full');
    expect(arrival()).toEqual({ x: 720, y: 838.5 });
  });
});
