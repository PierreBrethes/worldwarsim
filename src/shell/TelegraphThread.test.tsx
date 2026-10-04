// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider } from 'convex/react';
import type { ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Telegraph } from '@/data/telegraph';
import type { Seat } from '@/data/session';
import { TelegraphThread } from './TelegraphThread';

/**
 * **Un fil défile dans une boîte, il ne pousse pas la fenêtre** (retour de Pierre du 15/09). Le
 * cadre posait sa hauteur en plafond : la boîte grandissait message après message jusqu'à le
 * toucher, et la fenêtre du plateau bougeait sous la main du joueur à chaque dépêche. Ce que ce
 * test tient est donc une **hauteur**, et la réserve qui va avec — le fil ne se recolle en bas
 * que si on y était.
 *
 * jsdom ne met rien en page : les trois mesures du défilement sont posées à la main, ce qui est
 * exactement ce dont la règle a besoin — elle ne lit que ces trois nombres.
 */

/** Un client qui ne répond à rien : le fil reçoit ses messages en propriété, et la seule chose
 *  qu'il demande à Convex est d'envoyer — ce que ce test ne fait pas. */
const mute = (): ConvexReactClient =>
  ({
    watchQuery: () => ({
      localQueryResult: () => undefined,
      onUpdate: () => () => {},
      journal: () => undefined,
    }),
    mutation: () => Promise.resolve(),
  }) as unknown as ConvexReactClient;

const SEAT: Seat = { token: 'un-jeton', seasonId: 'une-saison' } as unknown as Seat;

const thread = (count: number): Telegraph => ({
  messages: Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    at: 1_757_000_000_000 + index * 1_000,
    text: `dépêche ${index}`,
    nickname: 'Pierre',
    nation: 'france',
    ink: '#276893',
    mine: false,
  })),
  unread: 0,
});

const HEIGHT = 420;

const box = (container: HTMLElement): HTMLDivElement =>
  container.querySelector<HTMLDivElement>('[class*="overflow-y-auto"]')!;

/** La mise en page que jsdom ne fait pas : une boîte de `HEIGHT` sur un contenu plus long. */
const lay = (element: HTMLDivElement, scrollHeight: number) => {
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: HEIGHT, configurable: true });
};

/** jsdom n'évalue aucune requête média : la largeur se pose à la main — le bureau par défaut. */
const atWidth = (pixels: number): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: pixels <= Number(/(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

beforeEach(() => atWidth(1440));
afterEach(cleanup);

const mount = (telegraph: Telegraph) =>
  render(
    <ConvexProvider client={mute()}>
      <TelegraphThread telegraph={telegraph} seat={SEAT} height={HEIGHT} />
    </ConvexProvider>,
  );

it('porte une hauteur, pas un plafond — la boîte ne bouge pas de dix à cinquante messages', () => {
  const { container, rerender } = mount(thread(10));
  const list = box(container);
  expect(list.style.height).toBe(`${HEIGHT}px`);
  expect(list.style.maxHeight).toBe('');

  rerender(
    <ConvexProvider client={mute()}>
      <TelegraphThread telegraph={thread(50)} seat={SEAT} height={HEIGHT} />
    </ConvexProvider>,
  );
  expect(box(container).style.height).toBe(`${HEIGHT}px`);
});

/** **À l'ouverture on est en bas** : c'est l'arriéré du fil qu'on vient lire, et son dernier
 *  message est celui qui compte. Le fil part donc collé, sans qu'un défilement l'ait dit. */
it('se colle au dernier message à l’ouverture', () => {
  const { container, rerender } = mount(thread(0));
  const list = box(container);
  lay(list, 4_000);

  rerender(
    <ConvexProvider client={mute()}>
      <TelegraphThread telegraph={thread(50)} seat={SEAT} height={HEIGHT} />
    </ConvexProvider>,
  );
  expect(list.scrollTop).toBe(4_000);
});

it('laisse la lecture où elle est quand un message arrive alors qu’on a remonté', () => {
  const { container, rerender } = mount(thread(50));
  const list = box(container);
  lay(list, 4_000);
  list.scrollTop = 1_200;
  list.dispatchEvent(new Event('scroll', { bubbles: true }));

  rerender(
    <ConvexProvider client={mute()}>
      <TelegraphThread telegraph={thread(51)} seat={SEAT} height={HEIGHT} />
    </ConvexProvider>,
  );
  expect(list.scrollTop).toBe(1_200);
});

it('recolle en bas quand un message arrive et qu’on y était', () => {
  const { container, rerender } = mount(thread(50));
  const list = box(container);
  lay(list, 4_000);
  list.scrollTop = 4_000 - HEIGHT;
  list.dispatchEvent(new Event('scroll', { bubbles: true }));

  rerender(
    <ConvexProvider client={mute()}>
      <TelegraphThread telegraph={thread(51)} seat={SEAT} height={HEIGHT} />
    </ConvexProvider>,
  );
  expect(list.scrollTop).toBe(4_000);
});

/** **Sous le seuil, les messages d'un même joueur se rangent sous un seul nom** (refonte mobile,
 *  1i), et les siens se signent « vous ». */
it('groups a sender’s run under one name on a phone, and signs one’s own « vous »', () => {
  atWidth(390);
  const now = Date.now();
  const messages: Telegraph = {
    messages: [
      {
        id: 'a',
        at: now - 3_000,
        text: 'un',
        nickname: 'Koval',
        nation: 'ussr',
        ink: '#9d4638',
        mine: false,
      },
      {
        id: 'b',
        at: now - 2_000,
        text: 'deux',
        nickname: 'Koval',
        nation: 'ussr',
        ink: '#9d4638',
        mine: false,
      },
      {
        id: 'c',
        at: now - 1_000,
        text: 'trois',
        nickname: 'Théo',
        nation: 'france',
        ink: '#276893',
        mine: true,
      },
    ],
    unread: 0,
  };
  render(
    <ConvexProvider client={mute()}>
      <TelegraphThread telegraph={messages} seat={SEAT} height="fill" />
    </ConvexProvider>,
  );
  expect(screen.getAllByText('Koval')).toHaveLength(1);
  expect(screen.getByText('vous')).toBeTruthy();
  expect(screen.getByText('aujourd’hui')).toBeTruthy();
});
