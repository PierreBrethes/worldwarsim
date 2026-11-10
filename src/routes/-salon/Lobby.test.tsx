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
import { afterEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { invitationUrl } from '@/domain/off-season';
import type { Seat } from '@/data/session';
import { ConnectedLobby } from './Lobby';

/** jsdom n'évalue aucune requête média et ne mesure rien. */
const noMedia = (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});
vi.stubGlobal('matchMedia', noMedia);
afterEach(() => {
  cleanup();
  vi.stubGlobal('matchMedia', noMedia);
});
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

const SEAT = { token: 'jeton', seasonId: 'season-1' } as unknown as Seat;
const REST = { startMinutes: 1320, endMinutes: 300 };
const player = (
  id: string,
  rest: { nation?: string | null; ready?: boolean; creator?: boolean; mine?: boolean } = {},
) => ({
  id,
  nickname: id,
  creator: false,
  nation: null as string | null,
  ready: false,
  mine: false,
  restWindow: REST,
  seenAt: null,
  ...rest,
});

/** Un salon de Mondiale tel que `seasons.lobby` le sert, vu du siège `mine`. */
const lobbyOf = (players: ReturnType<typeof player>[]) => {
  const me = players.find((entry) => entry.mine)!;
  return {
    code: 'K7Q2PX',
    status: 'lobby',
    mode: 'mondiale',
    theatre: null,
    launchRefusal: null,
    maximum: 8,
    durationHours: 168,
    orders: { scheduledAt: null, remind: null, hqCaptureHours: 12, seatCap: null },
    playableRegion: 'europe',
    me: {
      nickname: me.nickname,
      creator: me.creator,
      nation: me.nation,
      ready: me.ready,
      restWindow: REST,
    },
    players,
  };
};

/** `answer` : ce que le serveur répond à une mutation ; il peut aussi changer le salon servi. */
function mount(
  players: ReturnType<typeof player>[],
  answer: (
    name: string,
    serve: (lobby: ReturnType<typeof lobbyOf>) => void,
  ) => Promise<unknown> = () => Promise.resolve(null),
) {
  const answers: Record<string, unknown> = {
    'seasons:lobby': lobbyOf(players),
    'messages:recent': { messages: [], readAt: 0, direct: [] },
  };
  const listeners = new Set<() => void>();
  const serve = (lobby: ReturnType<typeof lobbyOf>) => {
    answers['seasons:lobby'] = lobby;
    listeners.forEach((notify) => notify());
  };
  const mutation = vi.fn((reference: unknown, _args: unknown) =>
    answer(getFunctionName(reference as Parameters<typeof getFunctionName>[0]), serve),
  );
  const client = {
    watchQuery: (query: Parameters<typeof getFunctionName>[0]) => ({
      localQueryResult: () => answers[getFunctionName(query)],
      onUpdate: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      journal: () => undefined,
    }),
    mutation,
  } as unknown as ConvexReactClient;
  const root = createRootRoute({ component: Outlet });
  const salon = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <ConnectedLobby seat={SEAT} />,
  });
  render(
    <ConvexProvider client={client}>
      <RouterProvider
        router={createRouter({
          routeTree: root.addChildren([salon]),
          history: createMemoryHistory({ initialEntries: ['/'] }),
        })}
      />
    </ConvexProvider>,
  );
  const sent = () =>
    mutation.mock.calls.map(([reference, args]) => [
      getFunctionName(reference as Parameters<typeof getFunctionName>[0]),
      args,
    ]);
  return { sent };
}

/** Les boutons de la place : ce que la table me propose de faire, hors drapeaux et télégraphe. */
const actions = () =>
  [...document.querySelectorAll('.sl-act button')].map((button) => button.textContent);

/**
 * **Une phrase, une action** : à chaque état la table dit ce qu'elle attend de moi, et n'offre
 * qu'un geste — celui que `tableStepOf` désigne.
 */
it('asks a newcomer for a nation, with no button but the flags', async () => {
  mount([player('Pierre', { creator: true, nation: 'france' }), player('Léa', { mine: true })]);

  expect(await screen.findByText(fr.table.sayNation(false))).toBeTruthy();
  expect(actions()).toEqual([]);
  expect(screen.getAllByRole('radio')).toHaveLength(8);
});

it('offers a guest who has a nation his « prêt », and nothing else', async () => {
  const { sent } = mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: 'germany' }),
  ]);

  expect(await screen.findByText(fr.table.sayReady)).toBeTruthy();
  expect(actions()).toEqual([fr.table.readyStamp]);
  fireEvent.click(screen.getByRole('button', { name: fr.table.readyStamp }));

  await waitFor(() => expect(sent()).toEqual([['players:declareReady', { ...SEAT, ready: true }]]));
});

it('lets a ready guest wait, and take his « prêt » back', async () => {
  mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: 'germany', ready: true }),
  ]);

  expect(await screen.findByText(fr.table.allReadyFounder('Pierre'))).toBeTruthy();
  expect(actions()).toEqual([fr.table.readyLift]);
});

/** **Inviter tient en un geste** : le lien part au presse-papiers, et le bouton le dit. */
it('has a founder alone invite: one click copies the invitation link', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  mount([player('Pierre', { creator: true, mine: true, nation: 'france' })]);

  expect(await screen.findByText(fr.table.waitingFor([fr.table.waitSecond]))).toBeTruthy();
  expect(actions()).toEqual([fr.table.inviteNow(false)]);
  fireEvent.click(screen.getByRole('button', { name: fr.table.inviteNow(false) }));

  expect(writeText).toHaveBeenCalledWith(invitationUrl(window.location.origin, 'K7Q2PX'));
  expect((await screen.findAllByText(fr.table.linkSent)).length).toBeGreaterThan(0);
});

/** Au doigt, le même geste ouvre la feuille de partage du téléphone, le lien dedans. */
it('shares the invitation link through the phone’s own sheet under a finger', async () => {
  const share = vi.fn((_shared: { url: string }) => Promise.resolve());
  vi.stubGlobal('navigator', { ...navigator, share });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  mount([player('Pierre', { creator: true, mine: true, nation: 'france' })]);

  fireEvent.click(await screen.findByRole('button', { name: fr.table.inviteNow(true) }));

  expect(share).toHaveBeenCalledOnce();
  expect(share.mock.calls[0]?.[0].url).toBe(invitationUrl(window.location.origin, 'K7Q2PX'));
});

it('makes the empty chairs one card, which invites too', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: 'germany', ready: true }),
  ]);

  fireEvent.click(await screen.findByRole('button', { name: new RegExp(fr.home.freeSeats(6)) }));

  expect(writeText).toHaveBeenCalledOnce();
});

it('has the founder wait for the others’ « prêt », never for his own', async () => {
  mount([
    player('Pierre', { creator: true, mine: true, nation: 'france' }),
    player('Léa', { nation: 'germany' }),
  ]);

  expect(await screen.findByText(fr.table.waitingFor([fr.table.waitReady(1)]))).toBeTruthy();
  expect(actions()).toEqual([]);
});

/**
 * **Le fondateur tamponne en lançant** : un clic, deux ordres dans l'ordre — son « prêt », puis
 * le lancement —, chacun par sa porte du serveur.
 */
it('launches in one click once the others are ready: the founder’s « prêt », then the launch', async () => {
  const { sent } = mount([
    player('Pierre', { creator: true, mine: true, nation: 'france' }),
    player('Léa', { nation: 'germany', ready: true }),
  ]);

  expect(await screen.findByText(fr.table.allReadyYou)).toBeTruthy();
  expect(actions()).toEqual([fr.table.launchSeason]);
  fireEvent.click(screen.getByRole('button', { name: fr.table.launchSeason }));

  await waitFor(() =>
    expect(sent()).toEqual([
      ['players:declareReady', { ...SEAT, ready: true }],
      ['seasons:launch', SEAT],
    ]),
  );
});

/**
 * Le « prêt » du fondateur n'est jamais attendu : si le lancement tombe après lui (un invité a
 * repris le sien), l'écran dit le refus et ne lui offre pas de le lever.
 */
it('says a refused launch and does not offer the founder to lift a « prêt » nobody waits for', async () => {
  const founder = player('Pierre', { creator: true, mine: true, nation: 'france' });
  const { sent } = mount([founder, player('Léa', { nation: 'germany', ready: true })], (name, serve) => {
    if (name === 'players:declareReady') {
      serve(
        lobbyOf([{ ...founder, ready: true }, player('Léa', { nation: 'germany', ready: false })]),
      );
      return Promise.resolve(null);
    }
    return Promise.reject(new ConvexError({ code: 'PLAYERS_NOT_READY', details: {} }));
  });

  fireEvent.click(await screen.findByRole('button', { name: fr.table.launchSeason }));

  await waitFor(() => expect(sent().map(([name]) => name)).toContain('seasons:launch'));
  expect((await screen.findByRole('alert')).textContent).toMatch(/prêt/i);
  expect(screen.queryByRole('button', { name: fr.table.readyLift })).toBeNull();
});

it('says who holds a nation instead of handing it over', async () => {
  const { sent } = mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true }),
  ]);

  const taken = await screen.findByRole('radio', { name: /France/ });
  expect(taken.getAttribute('title')).toBe(fr.table.takenBy('Pierre'));
  fireEvent.click(taken);
  fireEvent.click(screen.getByRole('radio', { name: /Italie/ }));

  await waitFor(() =>
    expect(sent()).toEqual([['players:reserveNation', { ...SEAT, nation: 'italy' }]]),
  );
});

it('copies the game code from its cartouche', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  mount([player('Pierre', { creator: true, mine: true })]);

  fireEvent.click(await screen.findByRole('button', { name: fr.table.copyCodeAria('K7Q2PX') }));

  expect(writeText).toHaveBeenCalledWith('K7Q2PX');
});
