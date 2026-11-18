// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
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

const mount = () =>
  render(
    <ConvexProvider client={client}>
      <PersonalBoard
        view={view}
        seat={SEAT}
        open={false}
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
