// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { ArcView, PlayerView } from '@/domain/player-view';
import type { RecruitmentDue, UnderwayPlace } from '@/domain/underway';
import { Reglette } from './Reglette';

/**
 * **Le tableau de marche** (#733) : l'onglet replié dit la prochaine échéance, la feuille déplie une
 * famille par ligne, un clic sur une barre recentre sans replier, et le pli se retient.
 */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
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

const NOW = Date.now();
const minutes = (count: number) => NOW + count * 60_000;
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const march = (id: string, left: number, destination: string): ArcView =>
  ({
    state: 'mine',
    id,
    type: 'march',
    stack: { infantry: 2 },
    destinationLabel: destination,
    troopIds: [],
    schedule: { departedAt: NOW, arrivesAt: minutes(left), heldAt: null, holdUntil: null },
  }) as unknown as ArcView;

const work = (id: string, key = 'mine', level = 1) => ({
  id,
  name: key === 'mine' ? 'Mine' : 'Caserne',
  key,
  outpostId: null,
  regionId: 'FRA-1',
  regionName: 'Somme',
  point: [3, 50],
  level,
  specialty: null,
  respecialize: false,
});

type Over = {
  arcs?: ArcView[];
  me?: Record<string, unknown>;
  mode?: 'mondiale' | 'blitz';
  used?: number;
  press?: unknown;
  concluded?: boolean;
};

const view = ({ arcs = [], me = {}, mode = 'mondiale', used = 0, press = null, concluded }: Over) =>
  ({
    mode,
    arcs,
    loadedAt: NOW,
    journal: [],
    strategicPoints: [],
    season: {
      number: 1,
      elapsedHours: 4,
      durationHours: 168,
      outcome: { concludedAt: concluded === true ? NOW : null },
    },
    press,
    me: {
      nation: 'france',
      defeated: false,
      hqLevel: 1,
      construction: null,
      constructionQueue: [],
      slots: { total: 2, used },
      research: { researched: [], running: null, queue: [] },
      chains: [],
      buildings: [],
      outposts: [],
      troops: [],
      funds: null,
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 500, ratePerHour: 0, cap: 1000 }]),
      ),
      ...me,
    },
  }) as unknown as PlayerView;

async function mount(
  shown: PlayerView,
  extra: { recruitments?: RecruitmentDue[]; onLocate?: (place: UnderwayPlace) => void } = {},
) {
  const root = createRootRoute();
  const board = createRoute({
    getParentRoute: () => root,
    path: '/plateau',
    component: () => (
      <Reglette
        view={shown}
        telegraphUnread={0}
        {...(extra.recruitments === undefined ? {} : { recruitments: extra.recruitments })}
        {...(extra.onLocate === undefined ? {} : { onLocate: extra.onLocate })}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([board]),
    history: createMemoryHistory({ initialEntries: ['/plateau'] }),
  });
  const rendered = render(<RouterProvider router={router} />);
  await screen.findByRole('banner');
  return rendered;
}

const tab = () => screen.getByRole('button', { name: new RegExp(fr.march.tab, 'i') });
const sheet = () => screen.queryByRole('region', { name: fr.march.sheet });
const busy = () =>
  view({
    arcs: [march('M-1', 90, 'Somme'), march('M-2', 20, 'Lille')],
    me: {
      construction: { ...work('W-0'), minutesLeft: 45 },
      constructionQueue: [work('W-1', 'barracks'), work('W-2')],
      resources: {
        ...view({}).me.resources,
        food: { stock: 100, ratePerHour: -10, cap: 400 },
      },
    },
    used: 2,
  });

describe('the tab of the march schedule, folded', () => {
  it('opens folded, and says the next due with its time and the number of the others', async () => {
    await mount(busy());
    expect(tab().getAttribute('aria-expanded')).toBe('false');
    expect(sheet()).toBeNull();
    const text = tab().textContent!;
    expect(text).toContain(fr.underway.movement(fr.movementTypes.march, 'Lille'));
    expect(text).toContain('20 min');
    // 2 movements + the head and two queued works + food + 0 other: all but the nearest.
    expect(text).toContain(fr.march.more(5));
  });

  it('says so when nothing runs', async () => {
    await mount(view({}));
    expect(tab().textContent).toContain(fr.march.none);
  });

  it('says it when the player is defeated or the season is concluded, and stays', async () => {
    await mount(view({ concluded: true }));
    expect(tab().textContent).toContain(fr.march.over);
  });

  it('is not there in a Blitz', async () => {
    await mount(view({ mode: 'blitz' }));
    expect(screen.queryByText(fr.march.tab)).toBeNull();
    expect(sheet()).toBeNull();
  });
});

describe('the sheet of the march schedule, unfolded', () => {
  it('has a bar per movement, the works head and queue, a row per draining stock, and no Autres row without a recruitment', async () => {
    await mount(busy());
    fireEvent.click(tab());
    const open = sheet()!;
    expect(tab().getAttribute('aria-expanded')).toBe('true');
    expect(tab().getAttribute('aria-controls')).toBe(open.id);
    const bars = within(open).getAllByTitle(/recentrer la carte/);
    // two movements, three works.
    expect(bars).toHaveLength(5);
    expect(within(open).getByText(fr.march.movements)).toBeTruthy();
    expect(within(open).getByText(fr.march.works)).toBeTruthy();
    expect(within(open).getByText(fr.march.stocks)).toBeTruthy();
    expect(within(open).getByText(/vivres/i)).toBeTruthy();
    expect(within(open).getByText(/^file vide à/)).toBeTruthy();
    expect(within(open).queryByText(fr.march.other)).toBeNull();
  });

  it('adds the Autres row when a recruitment runs', async () => {
    await mount(busy(), {
      recruitments: [
        {
          buildingId: 'B-1',
          key: 'barracks',
          regionId: 'FRA-1',
          regionName: 'Somme',
          endsAt: minutes(30),
        },
      ],
    });
    fireEvent.click(tab());
    expect(within(sheet()!).getByText(fr.march.other)).toBeTruthy();
    expect(within(sheet()!).getByText(fr.underway.recruitment('Somme'))).toBeTruthy();
  });

  it('recentres the map on a bar and stays open', async () => {
    const onLocate = vi.fn();
    await mount(busy(), { onLocate });
    fireEvent.click(tab());
    act(() =>
      within(sheet()!)
        .getByTitle(fr.underway.locate(fr.underway.movement(fr.movementTypes.march, 'Lille')))
        .click(),
    );
    expect(onLocate).toHaveBeenCalledWith({ kind: 'movement', arcId: 'M-2' });
    expect(sheet()).not.toBeNull();
    act(() => within(sheet()!).getAllByTitle(fr.underway.locate('Mine niv. 1'))[0]!.click());
    expect(onLocate).toHaveBeenLastCalledWith({
      kind: 'building',
      regionId: 'FRA-1',
      key: 'mine',
      point: [3, 50],
    });
  });

  it('says the refusal in the movements row when every slot is taken', async () => {
    await mount(busy());
    fireEvent.click(tab());
    expect(within(sheet()!).getByRole('status').textContent).toContain(
      fr.underway.slotsRefusal.freesAt(2, fr.underway.movement(fr.movementTypes.march, 'Lille')),
    );
  });

  it('keeps the movement slots sentence, the Transmissions cards and Halifax, in plain text', async () => {
    await mount(busy());
    fireEvent.click(tab());
    expect(within(sheet()!).getByText(/Deux slots au départ/)).toBeTruthy();
  });

  it('folds on Escape from the tab, and not from anywhere else', async () => {
    await mount(busy());
    fireEvent.click(tab());
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sheet()).not.toBeNull();
    fireEvent.keyDown(tab(), { key: 'Escape' });
    expect(sheet()).toBeNull();
  });

  it('folds on Escape from inside the sheet', async () => {
    await mount(busy());
    fireEvent.click(tab());
    fireEvent.keyDown(within(sheet()!).getAllByTitle(/recentrer la carte/)[0]!, { key: 'Escape' });
    expect(sheet()).toBeNull();
  });

  it('keeps its fold in the browser: unfolded, it comes back unfolded', async () => {
    const first = await mount(busy());
    expect(localStorage.getItem('wws-march-sheet')).toBeNull();
    fireEvent.click(tab());
    expect(localStorage.getItem('wws-march-sheet')).toBe('open');
    first.unmount();
    await mount(busy());
    expect(sheet()).not.toBeNull();
    fireEvent.click(tab());
    expect(localStorage.getItem('wws-march-sheet')).toBe('folded');
  });

  it('says nothing runs when nothing does', async () => {
    await mount(view({}));
    fireEvent.click(tab());
    expect(within(sheet()!).getByText(fr.march.none)).toBeTruthy();
  });
});
