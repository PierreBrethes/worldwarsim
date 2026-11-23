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
import { FIRST_SEVEN } from '@/domain/strategic-points';
import { THEATRE_DRAW } from '@/domain/operation-order';
import { WORLD_BOX } from '@/emblems/EngravedMap';
import { PHONE } from '@/shell/viewport';
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
const lobbyOf = (players: ReturnType<typeof player>[], over: object = {}) => {
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
    points: FIRST_SEVEN,
    me: {
      nickname: me.nickname,
      creator: me.creator,
      nation: me.nation,
      ready: me.ready,
      restWindow: REST,
    },
    players,
    ...over,
  };
};

/** `answer` : ce que le serveur répond à une mutation ; il peut aussi changer le salon servi. */
function mount(
  players: ReturnType<typeof player>[],
  answer: (
    name: string,
    serve: (lobby: ReturnType<typeof lobbyOf>) => void,
  ) => Promise<unknown> = () => Promise.resolve(null),
  over: object = {},
) {
  const answers: Record<string, unknown> = {
    'seasons:lobby': lobbyOf(players, over),
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
  const { sent } = mount(
    [founder, player('Léa', { nation: 'germany', ready: true })],
    (name, serve) => {
      if (name === 'players:declareReady') {
        serve(
          lobbyOf([
            { ...founder, ready: true },
            player('Léa', { nation: 'germany', ready: false }),
          ]),
        );
        return Promise.resolve(null);
      }
      return Promise.reject(new ConvexError({ code: 'PLAYERS_NOT_READY', details: {} }));
    },
  );

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

/** **La fiche s'écrit dans le cartouche** : au survol, au focus, ou à défaut la nation choisie. */
const cartouche = () => document.querySelector('.cartouche')!;

it('writes the sheet of the token under the pointer in the map cartouche, and the rest state otherwise', async () => {
  mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: null }),
  ]);

  await screen.findByRole('radiogroup');
  expect(cartouche().textContent).toContain(fr.table.restHint);

  const germany = screen.getByRole('radio', { name: new RegExp(fr.table.shortNation.germany) });
  fireEvent.mouseEnter(germany);
  expect(cartouche().textContent).toContain('Berlin');
  expect(cartouche().textContent).toContain(fr.nationAssets.blitzkrieg.name);
  expect(cartouche().textContent).toContain(fr.table.sheetNeighbours);

  fireEvent.mouseLeave(germany);
  expect(cartouche().textContent).toContain(fr.table.restHint);
});

it('says on a taken nation’s sheet who holds it, and opens the sheet at the focus too', async () => {
  mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: null }),
  ]);

  await screen.findByRole('radiogroup');
  fireEvent.focus(screen.getByRole('radio', { name: new RegExp(fr.table.shortNation.france) }));

  expect(cartouche().textContent).toContain(fr.table.heldBy('Pierre'));
  expect(cartouche().textContent).toContain(fr.table.classicNation);
});

it('writes the chosen nation’s sheet when nothing is hovered, and keeps the Blitz cartouche', async () => {
  mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: 'japan' }),
  ]);

  await screen.findByRole('radiogroup');
  expect(cartouche().textContent).toContain('Tokyo');
  expect(cartouche().textContent).toContain(fr.nationAssets.carrierDoctrine.name);
});

/** **Au téléphone** (sous 760 px) : le registre des huit remplace les jetons, un toucher regarde. */
const onPhone = () =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === PHONE || query === '(pointer: coarse)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
const row = (nation: keyof typeof fr.table.shortNation) =>
  screen.getByRole('radio', { name: new RegExp(`^${fr.nations[nation]}`) });

it('on a phone, a touch reads a nation and only « Prendre » reserves it', async () => {
  onPhone();
  const { sent } = mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: null }),
  ]);

  await screen.findByRole('radiogroup');
  expect(screen.getAllByRole('radio')).toHaveLength(8);
  expect(document.querySelector('.token')).toBeNull();
  fireEvent.click(row('germany'));
  expect(sent()).toEqual([]);
  expect(document.querySelector('.sheet-name')?.textContent).toBe(fr.table.phoneSheets.europe);
  expect(screen.getByText(fr.table.freeSay('germany'))).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: fr.table.take('germany') }));
  await waitFor(() =>
    expect(sent()).toEqual([['players:reserveNation', { ...SEAT, nation: 'germany' }]]),
  );
});

it('on a phone, a second touch lets the nation go, and a taken one offers nothing', async () => {
  onPhone();
  const { sent } = mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: null }),
  ]);

  await screen.findByRole('radiogroup');
  fireEvent.click(row('japan'));
  expect(screen.getByRole('button', { name: fr.table.take('japan') })).toBeTruthy();
  fireEvent.click(row('japan'));
  expect(screen.queryByRole('button', { name: fr.table.take('japan') })).toBeNull();
  expect(document.querySelector('.sheet-name')?.textContent).toBe(fr.table.world1940);

  fireEvent.click(row('france'));
  expect(screen.queryByRole('button', { name: fr.table.take('france') })).toBeNull();
  expect(screen.getByText(fr.table.takenSay('france', 'Pierre'))).toBeTruthy();
  expect(sent()).toEqual([]);
});

it('on a phone, a nation already mine offers no « Prendre »', async () => {
  onPhone();
  mount([
    player('Pierre', { creator: true, nation: 'france' }),
    player('Léa', { mine: true, nation: 'japan' }),
  ]);

  await screen.findByRole('radiogroup');
  fireEvent.click(row('japan'));
  expect(screen.queryByRole('button', { name: fr.table.take('japan') })).toBeNull();
});

/** **Un Blitz au théâtre tiré** n'a pas de théâtre : la carte garde le monde entier, sans teinte. */
it('keeps the whole world and no tint on a Blitz whose theatre is still to be drawn', async () => {
  const tinted = () => document.querySelectorAll('use[href^="#os-n-"]').length;
  mount([player('Pierre', { creator: true, nation: 'france' }), player('Léa', { mine: true })]);
  await screen.findByRole('radiogroup');
  expect(tinted()).toBeGreaterThan(0);
  cleanup();

  mount(
    [player('Pierre', { creator: true, nation: 'france' }), player('Léa', { mine: true })],
    undefined,
    { mode: 'blitz', theatre: THEATRE_DRAW },
  );
  await screen.findByRole('radiogroup');
  expect(tinted()).toBe(0);
  const [x0, , width] = document
    .querySelector('.sl-map svg[viewBox]')!
    .getAttribute('viewBox')!
    .split(' ')
    .map(Number);
  const [west, , east] = WORLD_BOX;
  expect(x0).toBeLessThanOrEqual(west + 180);
  expect(x0! + width!).toBeGreaterThanOrEqual(east + 180);
});
