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
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { DEFAULT_HQ_CAPTURE_HOURS, nextEvening } from '@/domain/operation-order';
import { forgetSession, keepSession, readSeat } from '@/data/session';
import { Route as FoundRoute } from '../fonder';
import { Found } from './Found';

beforeEach(() => keepSession('jeton'));
afterEach(() => {
  cleanup();
  forgetSession();
  vi.useRealTimers();
});
vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

const NOW = new Date(2026, 10, 10, 14, 0);

function mount(url = '/fonder', create?: () => Promise<unknown>, at: Date = NOW) {
  vi.useFakeTimers({ toFake: ['Date'], now: at });
  const mutation = vi.fn((_reference: unknown, _args: unknown) =>
    (create ?? (() => Promise.resolve({ code: 'K7Q2PX', seasonId: 'season-1' })))(),
  );
  const client = {
    watchQuery: () => ({
      localQueryResult: () => undefined,
      onUpdate: () => () => {},
      journal: () => undefined,
    }),
    mutation,
  } as unknown as ConvexReactClient;
  const root = createRootRoute({ component: Outlet });
  const found = createRoute({
    getParentRoute: () => root,
    path: '/fonder',
    validateSearch: FoundRoute.options.validateSearch,
    component: Found,
  });
  const witness = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: root.addChildren([found, witness('/salon'), witness('/accueil')]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  render(
    <ConvexProvider client={client}>
      <RouterProvider router={router} />
    </ConvexProvider>,
  );
  const created = () =>
    mutation.mock.calls.map(([reference, args]) => [
      getFunctionName(reference as Parameters<typeof getFunctionName>[0]),
      args,
    ]);
  return { router, created };
}

/**
 * **Fonder tient en un clic** : la carte d'une guerre la fonde, à ses valeurs d'usage — celles
 * que l'ordre d'opérations proposait par défaut —, et mène au salon où tout le reste se règle.
 */
it('founds a Mondiale in one click, at its usual settings, and opens the lobby', async () => {
  const { router, created } = mount();

  fireEvent.click(await screen.findByRole('button', { name: /fonder une Mondiale/ }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/salon'));
  expect(created()).toEqual([
    [
      'seasons:create',
      {
        token: 'jeton',
        compensation: 0.5,
        mode: 'mondiale',
        hqCaptureHours: DEFAULT_HQ_CAPTURE_HOURS,
        durationHours: 168,
      },
    ],
  ]);
  expect(readSeat()?.seasonId).toBe('season-1');
});

it('founds a Blitz in one click: Europe, tonight at nine, with its reminder', async () => {
  const { created } = mount();

  const card = await screen.findByRole('button', { name: /fonder une Blitz/ });
  expect(card.textContent).toContain(fr.modes.theatres.europe);
  fireEvent.click(card);

  await waitFor(() => expect(created()).toHaveLength(1));
  expect(created()[0]?.[1]).toEqual({
    token: 'jeton',
    compensation: 0.5,
    mode: 'blitz',
    theatre: 'europe',
    scheduledAt: nextEvening(NOW),
    remind: true,
  });
});

/** « Fonder à mon tour », depuis une table refusée (choix 19) : sa guerre, sur son théâtre. */
it('founds the refused table’s kind of game on its theatre', async () => {
  const { created } = mount('/fonder?mode=blitz&theatre=pacific');

  const card = await screen.findByRole('button', { name: /fonder une Blitz/ });
  expect(card.textContent).toContain(fr.modes.theatres.pacific);
  expect(card.closest('article')?.hasAttribute('data-asked')).toBe(true);
  fireEvent.click(card);

  await waitFor(() => expect(created()).toHaveLength(1));
  expect(created()[0]?.[1]).toMatchObject({ mode: 'blitz', theatre: 'pacific' });
});

it('says the server’s refusal on the page, and stays there', async () => {
  const { router } = mount('/fonder', () =>
    Promise.reject(new ConvexError({ code: 'UNKNOWN_SESSION' })),
  );

  fireEvent.click(await screen.findByRole('button', { name: /fonder une Mondiale/ }));

  expect((await screen.findByRole('alert')).textContent).toBe(fr.errors.UNKNOWN_SESSION());
  expect(router.state.location.pathname).toBe('/fonder');
});

/** L'horloge de la page bat toutes les 30 s : le clic relit l'heure, pas le dernier battement. */
it('asks for the evening that is next when the click lands, not when the page last drew', async () => {
  const { created } = mount('/fonder', undefined, new Date(2026, 10, 10, 20, 59, 50));
  const card = await screen.findByRole('button', { name: /fonder une Blitz/ });

  vi.setSystemTime(new Date(2026, 10, 10, 21, 0, 5));
  fireEvent.click(card);

  await waitFor(() => expect(created()).toHaveLength(1));
  expect(created()[0]?.[1]).toMatchObject({ scheduledAt: new Date(2026, 10, 11, 21, 0).getTime() });
});

it('gives each war a heading of its own and a button named after it', async () => {
  mount();

  const button = await screen.findByRole('button', { name: /fonder une Mondiale/ });
  expect(button.querySelector('h2, dl, svg')).toBeNull();
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
  expect(button.getAttribute('aria-describedby')).toBe(
    screen.getByRole('heading', { name: /Mondiale/ }).id,
  );
});
