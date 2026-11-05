// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { keepSession } from '@/data/session';
import { ConnectedHome } from './accueil';

beforeEach(() => keepSession('jeton'));
afterEach(cleanup);
vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

const CONCLUDED_AT = Date.UTC(2026, 10, 3, 14);

/** Une Mondiale conclue encore là, et l'archive de la sienne et d'une autre, détruite. */
const SEAT = {
  seasonId: 'season-here',
  code: 'HERE01',
  mode: 'mondiale',
  theatre: null,
  status: 'concluded',
  createdAt: 0,
  concludedAt: CONCLUDED_AT,
  launchedAt: 0,
  durationHours: 240,
  winnerNation: 'france',
  defeated: false,
  nation: 'france',
  creator: false,
  maximum: 8,
  players: 3,
  playableRegion: 'europe',
  table: [],
  orders: { scheduledAt: null },
};
const edition = (seasonId: string, editionId: string, code: string) => ({
  editionId,
  seasonId,
  code,
  concludedAt: CONCLUDED_AT,
  playableRegion: 'europe',
  verdict: { reason: 'points', winnerNation: 'france' },
  nation: 'germany',
  rank: 2,
  nations: 3,
});

function mount() {
  const answers: Record<string, unknown> = {
    'accounts:me': { nickname: 'Pierre' },
    'accounts:seats': [SEAT],
    'finalEdition:recent': [
      edition('season-here', 'edition-here', 'HERE01'),
      edition('season-gone', 'edition-gone', 'GONE02'),
    ],
  };
  const client = {
    watchQuery: (query: Parameters<typeof getFunctionName>[0]) => ({
      localQueryResult: () => answers[getFunctionName(query)],
      onUpdate: () => () => {},
      journal: () => undefined,
    }),
    mutation: vi.fn(),
  } as unknown as ConvexReactClient;
  const root = createRootRoute({ component: Outlet });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/accueil',
    component: ConnectedHome,
  });
  const read = createRoute({
    getParentRoute: () => root,
    path: '/edition/$id',
    component: function Read() {
      return <p>édition {read.useParams().id}</p>;
    },
  });
  render(
    <ConvexProvider client={client}>
      <RouterProvider
        router={createRouter({
          routeTree: root.addChildren([home, read]),
          history: createMemoryHistory({ initialEntries: ['/accueil'] }),
        })}
      />
    </ConvexProvider>,
  );
}

it('montre les dernières éditions finales, sans doubler la saison encore là', async () => {
  mount();
  await screen.findByText(fr.finalEdition.recent.title);
  expect(screen.getByText(/saison GONE02/)).toBeTruthy();
  expect(screen.queryByText(/saison HERE01/)).toBeNull();
});

it('ouvre l’édition depuis l’article d’une saison conclue qui a son archive', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: fr.home.readBack }));
  await waitFor(() => expect(screen.getByText('édition edition-here')).toBeTruthy());
});
