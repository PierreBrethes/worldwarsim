// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
import type { Id } from '../../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import type { PressEdition } from '@/domain/player-view';
import { editionFixture } from '@/shell/final-edition/edition.fixture';
import { PressWindow } from './PressWindow';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

const FINAL: PressEdition = { at: 1, next: null, final: true, mine: null, others: [] };

/** Le plateau d'une saison conclue : la presse, et ce que le serveur répond de l'archive. */
function mount(options: { blitz?: boolean; press?: PressEdition; archive: unknown }) {
  const asked: string[] = [];
  const client = {
    watchQuery: (query: Parameters<typeof getFunctionName>[0]) => {
      asked.push(getFunctionName(query));
      return {
        localQueryResult: () => options.archive,
        onUpdate: () => () => {},
        journal: () => undefined,
      };
    },
  } as unknown as ConvexReactClient;
  const root = createRootRoute({ component: Outlet });
  const board = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => (
      <PressWindow
        seat={{ token: 'jeton', seasonId: 'season-1' as Id<'seasons'> }}
        press={options.press ?? FINAL}
        verdict={{ reason: 'points', winnerNation: 'france', perMinute: null }}
        ending={{ nation: 'france', eliminatedAt: null }}
        blitz={options.blitz ?? false}
        points={[]}
        race={null}
        rank={0}
        inFront
        onBringForward={() => {}}
        onClose={() => {}}
      />
    ),
  });
  const home = createRoute({ getParentRoute: () => root, path: '/accueil', component: () => null });
  render(
    <ConvexProvider client={client}>
      <RouterProvider
        router={createRouter({
          routeTree: root.addChildren([board, home]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })}
      />
    </ConvexProvider>,
  );
  return asked;
}

it('ouvre l’édition finale en grande feuille quand l’archive est imprimée', async () => {
  mount({ archive: { state: 'ready', edition: editionFixture() } });
  expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
    'La France l’emporte',
  );
});

it('garde la page d’aujourd’hui, et dit l’attente, tant que l’archive s’imprime', async () => {
  mount({ archive: { state: 'pending' } });
  expect((await screen.findByRole('status')).textContent).toBe(fr.finalEdition.pending);
});

it('garde la page d’aujourd’hui, et dit l’absence, sans archive', async () => {
  mount({ archive: { state: 'none' } });
  expect((await screen.findByRole('status')).textContent).toBe(fr.finalEdition.absent);
});

it('ne demande pas l’archive d’une Blitz', async () => {
  const asked = mount({ blitz: true, archive: { state: 'none' } });
  await screen.findByText(fr.press.title);
  expect(asked).not.toContain('finalEdition:ofSeason');
  expect(screen.queryByRole('status')).toBeNull();
});
