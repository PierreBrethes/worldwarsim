// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES, type BuildingKey } from '@/domain/ids';
import type { Building, PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { PersonalBoard } from './PersonalBoard';

/**
 * **Le volet du bureau** (#580) : déplié, toute la file des chantiers, la tête avec sa barre et
 * sans « annuler », deux colonnes au-delà de quatre ; armer une tuile le replie, et il ne se
 * rouvre pas seul.
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
  // jsdom has no Web Animations: the cascade of the reopened volet calls it.
  Element.prototype.animate = () => ({}) as Animation;
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
const work = (rank: number) => ({
  id: `W-${rank}`,
  name: `Ferme ${rank}`,
  key: 'farm',
  outpostId: null,
  regionId: 'FR-NOR',
  regionName: 'Nord',
  point: null,
  minutesLeft: 10,
  minutes: 20,
  level: 2,
});
const viewWith = (works: number) =>
  ({
    loadedAt: 0,
    mode: 'mondiale',
    captures: [],
    arcs: [],
    boardRead: null,
    surveyedInstallations: [],
    buildCatalog: new Proxy(
      {},
      { get: () => ({ minutes: 1, cost: { steel: 10 }, lockedBy: null }) },
    ),
    me: {
      nation: 'france',
      defeated: false,
      troops: [],
      stationedCargo: [],
      construction: works > 0 ? work(1) : null,
      constructionQueue: Array.from({ length: Math.max(0, works - 1) }, (_, k) => work(k + 2)),
      recruiting: [],
      regions: [{ id: 'FR-NOR', name: 'Nord', linked: true }],
      buildings: [],
      foundation: [],
      extraction: [],
      evacuated: [],
      outposts: [],
      chains: [],
      hqLevel: 0,
      upkeep: {},
      research: { researched: [], running: null, queue: [] },
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 340, ratePerHour: 4, cap: 400 }]),
      ),
    },
  }) as unknown as PlayerView;

const barracks = {
  id: 'B-barracks',
  key: 'barracks',
  name: 'Caserne',
  regionId: 'FR-NOR',
  point: [3, 50],
  level: 1,
} as unknown as Building;
const board = (
  works: number,
  placing: BuildingKey | null = null,
  open = true,
  site: Building | null = null,
) => (
  <ConvexProvider client={client}>
    <PersonalBoard
      view={viewWith(works)}
      seat={SEAT}
      open={open}
      onOpen={() => {}}
      research={false}
      onResearch={() => {}}
      front
      focused={null}
      site={site}
      onDeselectSite={() => {}}
      onOpenSiteSheet={() => {}}
      onHoldTile={() => {}}
      onPlaceTile={() => false}
      maquetteAt={null}
      placing={placing}
    />
  </ConvexProvider>
);

const queue = () => screen.getByRole('list', { name: fr.personalBoard.worksHeader });

describe('the unfolded volet at the desk', () => {
  it('lists every queued work with its refunded cancel, and none on the running head', () => {
    render(board(8));
    const cancels = screen.getAllByRole('button', { name: /^Annuler .* : remboursé$/ });
    expect(cancels).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /^Annuler Ferme 1 / })).toBeNull();
    expect(screen.getByText(fr.personalBoard.refundNote)).toBeTruthy();
  });

  it('sets the queue in two columns past four works, one up to four', () => {
    const { rerender } = render(board(4));
    expect(queue().style.gridTemplateColumns).toBe('');
    rerender(board(5));
    expect(queue().style.gridTemplateColumns).toBe('1fr 1fr');
  });

  it('reads each reserve on a line, with its ceiling', () => {
    render(board(0));
    expect(screen.getAllByText('/ 400')).toHaveLength(RESOURCES.length);
  });

  it('never cuts a work line or a heap state with an ellipsis (#712)', () => {
    render(board(3));
    const volet = queue().closest('[data-volet-column]')!.parentElement!;
    const cut = [...volet.querySelectorAll('.truncate')].map((node) => node.textContent);
    expect(
      cut.filter((text) => text !== fr.personalBoard.hqSpeed(fr.common.levelSpeed(1))),
    ).toEqual([]);
    expect(screen.getAllByText(fr.heap.board.noHeap)[0]!.closest('.truncate')).toBeNull();
  });

  it('folds when a tile is armed, and stays folded when it is let go', () => {
    const { rerender } = render(board(8));
    const handle = screen.getByRole('button', { name: fr.footBar.grip.fold });
    expect(queue().closest('[inert]')).toBeNull();
    rerender(board(8, 'farm'));
    expect(queue().closest('[inert]')).not.toBeNull();
    rerender(board(8));
    expect(queue().closest('[inert]')).not.toBeNull();
    expect(handle.getAttribute('aria-label')).toBe(fr.footBar.grip.open);
    fireEvent.click(handle);
    expect(queue().closest('[inert]')).toBeNull();
  });

  it('opens whole again when it was closed after an arming', () => {
    const { rerender } = render(board(8, 'farm'));
    rerender(board(8, null, false));
    rerender(board(8));
    expect(queue().closest('[inert]')).toBeNull();
  });

  it('keeps a selected site in its band while a tile is armed', () => {
    render(board(8, 'farm', true, barracks));
    const cards = screen.getByRole('region', { name: fr.personalBoard.siteCards('Caserne') });
    expect(cards.closest('[inert]')).toBeNull();
  });

  it('cascades the first lines of each column, not only of the longest queue', () => {
    const animated: Element[] = [];
    Element.prototype.animate = function (this: Element) {
      animated.push(this);
      return {} as Animation;
    };
    const { rerender } = render(board(8, null, false));
    animated.length = 0;
    rerender(board(8));
    const inColumn = (name: string) =>
      animated.filter(
        (one) => one.closest<HTMLElement>('[data-volet-column]')?.dataset.voletColumn === name,
      );
    expect(inColumn('works').length).toBe(8);
    for (const name of ['reserves', 'heaps', 'lots']) {
      expect(inColumn(name).length).toBeGreaterThan(0);
    }
  });
});
