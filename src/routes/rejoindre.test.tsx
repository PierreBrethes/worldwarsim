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
import { ConvexProvider } from 'convex/react';
import type { ConvexReactClient } from 'convex/react';
import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { forgetSession, keepSession, readSeat } from '@/data/session';
import { InvitationPage } from './rejoindre.$code';

beforeEach(() => forgetSession());
afterEach(cleanup);

/** jsdom n'évalue aucune requête média : la feuille d'entrée en lit une pour choisir son fond. */
vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));

const OPEN = {
  refusal: null,
  mode: 'mondiale',
  theatre: null,
  orders: { scheduledAt: null, remind: null, hqCaptureHours: 12, seatCap: null },
  seats: [
    { nickname: 'Pierre', nation: 'france', seenAt: null },
    { nickname: 'Léa', nation: null, seenAt: null },
  ],
  founder: 'Pierre',
  players: 2,
  maximum: 8,
  status: 'lobby',
  durationHours: 48,
  registrationClosesAt: null,
  seated: null,
};

/** The server as the page sees it: queries answer what the test says, the two actions and the
 *  join are spies. */
function mount(options: {
  invitation: object | undefined;
  me?: { nickname: string } | null | undefined;
  join?: () => Promise<unknown>;
  code?: string;
}) {
  const answers: Record<string, unknown> = {
    'seasons:invitation': options.invitation,
    'accounts:me': options.me,
  };
  const join = vi.fn((_reference: unknown, _args: unknown) =>
    (options.join ?? (() => Promise.resolve({ seasonId: 'season-1' })))(),
  );
  const action = vi.fn(() => Promise.resolve({ token: 'jeton-neuf' }));
  const client = {
    watchQuery: (query: Parameters<typeof getFunctionName>[0]) => ({
      localQueryResult: () => answers[getFunctionName(query)],
      onUpdate: () => () => {},
      journal: () => undefined,
    }),
    mutation: join,
    action,
  } as unknown as ConvexReactClient;

  const root = createRootRoute({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <InvitationPage code={options.code ?? 'K7Q2PX'} />,
  });
  const home = createRoute({ getParentRoute: () => root, path: '/accueil', component: () => null });
  render(
    <ConvexProvider client={client}>
      <RouterProvider
        router={createRouter({
          routeTree: root.addChildren([index, home]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })}
      />
    </ConvexProvider>,
  );
  return { join, action };
}

/**
 * **Une page qui se lit avant d'avoir un compte.** Elle dit qui invite et ce qu'il reste de
 * place, porte le formulaire de connexion si personne n'est connecté, et un refus y est une
 * phrase avec une sortie — jamais un bouton grisé (ADR 0015).
 */
it('says who invites and what is left, and offers the account form to a stranger', async () => {
  mount({ invitation: OPEN });

  expect(await screen.findByText(fr.invitation.takeSeat('Pierre'))).toBeTruthy();
  expect(screen.getByText(fr.invitation.yourSeat(5))).toBeTruthy();
  expect(screen.getByLabelText(fr.auth.nicknameLabel)).toBeTruthy();
});

/**
 * **La feuille se quitte dans tous ses états, et vers la page d'où l'on vient** : la une pour un
 * visiteur — l'accueil le renverrait à la connexion, pas au champ où retaper son code —,
 * l'accueil pour un compte.
 */
it('leads a stranger back to the front page, even with nothing refused', async () => {
  mount({ invitation: OPEN });

  const exit = await screen.findByRole('link', { name: fr.front.back });
  expect(exit.getAttribute('href')).toBe('/');
});

it('leads a signed-in account back home, even with nothing refused', async () => {
  keepSession('jeton-connu');
  mount({ invitation: OPEN, me: { nickname: 'Léa' } });

  const exit = await screen.findByRole('link', { name: fr.invitation.toHome });
  expect(exit.getAttribute('href')).toBe('/accueil');
});

it('joins and opens the lobby for an account that is already signed in', async () => {
  keepSession('jeton-connu');
  const { join } = mount({ invitation: OPEN, me: { nickname: 'Léa' } });

  fireEvent.click(await screen.findByRole('button', { name: fr.invitation.join }));

  await waitFor(() => expect(readSeat()?.seasonId).toBe('season-1'));
  expect(join.mock.calls[0]?.[1]).toEqual({ token: 'jeton-connu', code: 'K7Q2PX' });
});

it('resumes the seat of an account that already holds one, instead of joining twice', async () => {
  keepSession('jeton-connu');
  const { join } = mount({
    invitation: {
      ...OPEN,
      refusal: 'SEAT_TAKEN',
      seated: { seasonId: 'season-9', status: 'lobby', atWar: false },
    },
    me: { nickname: 'Léa' },
  });

  fireEvent.click(await screen.findByRole('button', { name: fr.invitation.resume }));

  await waitFor(() => expect(readSeat()?.seasonId).toBe('season-9'));
  expect(join).not.toHaveBeenCalled();
});

const context = { founder: 'Pierre', maximum: 8, theatre: null };

it.each([
  'UNKNOWN_GAME_CODE',
  'SEASON_CONCLUDED',
  'NO_FREE_NATION',
  'LOBBY_FULL',
  'REGISTRATION_CLOSED',
  'BLITZ_STARTED',
] as const)('answers a %s refusal with a telegram of regrets and a way out', async (refusal) => {
  mount({ invitation: { ...OPEN, refusal } });

  const title = fr.table.refusals[refusal](context).title;
  expect((await screen.findByRole('alert')).textContent).toBe(title);
  expect(screen.getByRole('link', { name: fr.invitation.myGames })).toBeTruthy();
  expect(screen.queryByLabelText(fr.auth.nicknameLabel)).toBeNull();
});

it('offers to found the same kind of game from a full table', async () => {
  mount({ invitation: { ...OPEN, refusal: 'LOBBY_FULL' } });

  const found = await screen.findByRole('link', {
    name: fr.table.refusals.LOBBY_FULL(context).found!,
  });
  expect(found.getAttribute('href')).toBe('/fonder?mode=mondiale');
});

it('answers a code that cannot be one without asking the server anything', async () => {
  mount({ invitation: undefined, code: 'K7Q2P0' });

  expect((await screen.findByRole('alert')).textContent).toBe(
    fr.table.refusals.UNKNOWN_GAME_CODE().title,
  );
});

/**
 * **Le compte peut naître sans place** : l'inscription réussit, le salon s'est rempli entre-temps
 * et `join` refuse. La session est gardée, la page dit le refus, et mène à l'accueil — pas de
 * retour en arrière du compte.
 */
it('keeps the account when the lobby filled up between the sign-up and the join', async () => {
  const { action, join } = mount({
    invitation: OPEN,
    join: () => Promise.reject(new ConvexError({ code: 'LOBBY_FULL', maximum: 8 })),
  });

  fireEvent.click(await screen.findByRole('tab', { name: fr.auth.openFile }));
  fireEvent.change(screen.getByLabelText(fr.auth.nicknameLabel), { target: { value: 'Nouveau' } });
  fireEvent.change(screen.getByLabelText(fr.auth.passwordLabel), {
    target: { value: 'un-mot-de-passe' },
  });
  fireEvent.click(screen.getByRole('button', { name: fr.auth.registerAndJoin }));

  expect((await screen.findByRole('alert')).textContent).toBe(
    fr.table.refusals.LOBBY_FULL(context).title,
  );
  expect(action).toHaveBeenCalledOnce();
  expect(join.mock.calls[0]?.[1]).toEqual({ token: 'jeton-neuf', code: 'K7Q2PX' });
  expect(localStorage.getItem('wws-session')).toBe('jeton-neuf');
  expect(screen.getByText(fr.invitation.accountKept)).toBeTruthy();
  expect(screen.getByRole('link', { name: fr.invitation.myGames })).toBeTruthy();
});

it('chains the sign-up, the join and the lobby in one send', async () => {
  const { action, join } = mount({ invitation: OPEN });

  fireEvent.click(await screen.findByRole('tab', { name: fr.auth.openFile }));
  fireEvent.change(screen.getByLabelText(fr.auth.nicknameLabel), { target: { value: 'Nouveau' } });
  fireEvent.change(screen.getByLabelText(fr.auth.passwordLabel), {
    target: { value: 'un-mot-de-passe' },
  });
  fireEvent.click(screen.getByRole('button', { name: fr.auth.registerAndJoin }));

  await waitFor(() => expect(readSeat()).toEqual({ token: 'jeton-neuf', seasonId: 'season-1' }));
  expect(action).toHaveBeenCalledOnce();
  expect(join).toHaveBeenCalledOnce();
});
