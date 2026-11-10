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
import { announceArrival, takeArrival } from '@/data/arrival';
import { forgetSeat, keepSession, readSeat } from '@/data/session';
import { ConnectedHome } from './Home';

beforeEach(() => keepSession('jeton'));
afterEach(() => {
  cleanup();
  forgetSeat();
  takeArrival();
});
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

/** Une Mondiale qui court, et un salon qui attend : les deux parties qu'un joueur peut tenir. */
const WAR = { ...SEAT, seasonId: 'season-war', code: 'WAR002', status: 'launched' };
const LOBBY = {
  ...SEAT,
  seasonId: 'season-lobby',
  code: 'LOB003',
  status: 'lobby',
  nation: null,
  table: [
    { nickname: 'Pierre', nation: null, ready: false, creator: true, mine: true, seenAt: null },
  ],
};

function mount(seats: ReadonlyArray<object> = [SEAT]) {
  const answers: Record<string, unknown> = {
    'accounts:me': { nickname: 'Pierre' },
    'accounts:seats': seats,
    'finalEdition:recent': [
      edition('season-here', 'edition-here', 'HERE01'),
      ...['GONE02', 'GONE03', 'GONE04', 'GONE05'].map((code) =>
        edition(`season-${code}`, `edition-${code}`, code),
      ),
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
  const witness = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <p>{path}</p> });
  const invitation = createRoute({
    getParentRoute: () => root,
    path: '/rejoindre/$code',
    component: function Invitation() {
      return <p>invitation {invitation.useParams().code}</p>;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([home, read, invitation, witness('/plateau'), witness('/salon')]),
    history: createMemoryHistory({ initialEntries: ['/accueil'] }),
  });
  render(
    <ConvexProvider client={client}>
      <RouterProvider router={router} />
    </ConvexProvider>,
  );
  return router;
}

it('montre les dernières éditions finales, sans doubler la saison encore là', async () => {
  mount();
  await screen.findByText(fr.finalEdition.recent.title);
  expect(screen.queryByText(/saison HERE01/)).toBeNull();
  /** Trois, comptés après la saison encore là : le serveur en rend plus pour les articles. */
  for (const code of ['GONE02', 'GONE03', 'GONE04'])
    expect(screen.getByText(new RegExp(`saison ${code}`))).toBeTruthy();
  expect(screen.queryByText(/saison GONE05/)).toBeNull();
});

it('ouvre l’édition depuis l’article d’une saison conclue qui a son archive', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: fr.home.readBack }));
  await waitFor(() => expect(screen.getByText('édition edition-here')).toBeTruthy());
});

/**
 * **Le joueur qui revient n'a rien à cliquer quand une seule partie l'attend** : l'adresse nue
 * et la connexion annoncent une arrivée, et l'accueil mène droit à la place — plateau ou salon —
 * sans montrer sa une.
 */
it('mène droit au plateau qui arrive avec une seule guerre en cours', async () => {
  announceArrival();
  const router = mount([WAR, SEAT]);

  await waitFor(() => expect(router.state.location.pathname).toBe('/plateau'));
  expect(readSeat()?.seasonId).toBe('season-war');
  expect(screen.queryByText(fr.finalEdition.recent.title)).toBeNull();
});

it('mène droit au salon qui arrive avec un seul salon ouvert', async () => {
  announceArrival();
  const router = mount([LOBBY]);

  await waitFor(() => expect(router.state.location.pathname).toBe('/salon'));
  expect(readSeat()?.seasonId).toBe('season-lobby');
});

it('montre la une à qui arrive avec deux parties, ou aucune', async () => {
  announceArrival();
  const router = mount([WAR, LOBBY]);

  expect(await screen.findByRole('button', { name: fr.home.resumeAs('France') })).toBeTruthy();
  expect(router.state.location.pathname).toBe('/accueil');
});

/** Venu du plateau ou d'un salon qu'on quitte, on voulait sa une : rien n'emmène ailleurs. */
it('garde à l’accueil qui y vient sans arriver, même avec une seule partie', async () => {
  const router = mount([WAR]);

  expect(await screen.findByRole('button', { name: fr.home.resumeAs('France') })).toBeTruthy();
  expect(router.state.location.pathname).toBe('/accueil');
});

/** Le sceau du lancement ne se rejoue pas à chaque visite : reprendre ouvre le plateau. */
it('reprend une guerre droit sur le plateau, sans sas', async () => {
  const router = mount([WAR]);

  fireEvent.click(await screen.findByRole('button', { name: fr.home.resumeAs('France') }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/plateau'));
  expect(readSeat()?.seasonId).toBe('season-war');
});

it('ouvre l’invitation au sixième caractère du code, et offre de fonder', async () => {
  const router = mount([]);

  expect(
    (await screen.findAllByRole('link', { name: fr.home.foundSubmit }))[0]?.getAttribute('href'),
  ).toBe('/fonder');
  fireEvent.change(screen.getByLabelText(fr.home.codeLabel), { target: { value: 'k7q2px' } });

  await waitFor(() => expect(router.state.location.pathname).toBe('/rejoindre/K7Q2PX'));
});

it('ouvre l’invitation d’un lien collé dans le coupon', async () => {
  const router = mount([]);

  fireEvent.change(await screen.findByLabelText(fr.home.codeLabel), {
    target: { value: 'https://exemple.test/rejoindre/k7q2px?depuis=sms' },
  });

  await waitFor(() => expect(router.state.location.pathname).toBe('/rejoindre/K7Q2PX'));
});

/**
 * **La une et le salon disent la même chose de la même place** (`tableStepOf`) : le « prêt » du
 * fondateur part avec son lancement, la une ne le lui réclame donc pas — elle l'attend pour
 * lancer, dès que les autres sont prêts.
 */
it('attend le fondateur pour lancer, jamais pour son « prêt »', async () => {
  const seated = (rest: object) => ({
    nickname: 'Léa',
    nation: 'germany',
    ready: true,
    creator: false,
    mine: false,
    seenAt: null,
    ...rest,
  });
  mount([
    {
      ...LOBBY,
      creator: true,
      nation: 'france',
      table: [
        seated({ nickname: 'Pierre', nation: 'france', ready: false, creator: true, mine: true }),
        seated({}),
      ],
    },
  ]);

  expect(await screen.findByText(new RegExp(fr.home.waitingLaunch))).toBeTruthy();
  expect(screen.queryByText(new RegExp(fr.home.waitingReady))).toBeNull();
});
