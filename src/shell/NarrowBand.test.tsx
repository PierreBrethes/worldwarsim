// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRouter,
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr, nationLabel } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { NarrowBand } from './NarrowBand';
import { SoleSurfaceProvider } from './sole-surface';

/**
 * **La réglette du téléphone** (refonte mobile, 1a et 1s ; table plein écran) : la ligne de la
 * nation et des mouvements, huit colonnes dessous, et le drapeau qui ouvre le dossier de la nation — ce qu'on
 * cherche à froid, une ligne par porte. Il ne se replie plus.
 */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const view = {
  loadedAt: Date.now(),
  season: { number: 1, elapsedHours: 460, durationHours: 168 * 4 },
  press: { mine: { rank: 2, nickname: 'Théo' } },
  me: {
    nation: 'france',
    defeated: false,
    slots: { total: 3, used: 1 },
    research: { researched: [], running: null, queue: [] },
    chains: [],
    buildings: [],
    troops: [{}, {}, {}],
    funds: null,
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 40, ratePerHour: 2, cap: 400 }]),
    ),
  },
} as unknown as PlayerView;

const columns = () =>
  RESOURCES.flatMap((resource) => screen.queryAllByTitle(fr.resources[resource]));

async function mount(
  onShowBriefing = () => {},
  shown = view,
  onPin: (resource: string) => void = () => {},
): Promise<AnyRouter> {
  const root = createRootRoute();
  const board = createRoute({
    getParentRoute: () => root,
    path: '/plateau',
    component: () => (
      <SoleSurfaceProvider>
        <NarrowBand view={shown} onShowBriefing={onShowBriefing} pinned={[]} onPin={onPin} />
      </SoleSurfaceProvider>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([board]),
    history: createMemoryHistory({ initialEntries: ['/plateau'] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findAllByTitle(fr.resources.coal);
  return router;
}

const dossierButton = () => screen.getByTitle(fr.dossier.open(nationLabel('france')));

describe('the narrow band', () => {
  it('reads five columns under the nation line, and the slots beside it', async () => {
    await mount();
    expect(columns()).toHaveLength(5);
    expect(screen.getByText(fr.banner.slotsCount(1, 3))).toBeTruthy();
  });

  it('hangs the alert under a dry reserve, never under a full one', async () => {
    const resources = {
      ...view.me.resources,
      coal: { ...view.me.resources.coal, stock: 400 },
      oil: { ...view.me.resources.oil, stock: 0, ratePerHour: 0 },
      steel: { ...view.me.resources.steel, stock: 30, ratePerHour: -2.9 },
    };
    await mount(() => {}, { ...view, me: { ...view.me, resources } } as PlayerView);
    expect(screen.getByText(fr.resourceBand.dry)).toBeTruthy();
    expect(screen.getByText(fr.resourceBand.drySoonShort(10))).toBeTruthy();
    expect(screen.queryAllByText(/à sec/)).toHaveLength(2);
  });

  it('asks for a resource’s ledger on a touch, never on a hover', async () => {
    const onPin = vi.fn();
    await mount(() => {}, view, onPin);
    act(() => screen.getByTitle(fr.resources.coal).click());
    expect(onPin).toHaveBeenCalledWith('coal');
  });

  it('opens the nation’s dossier from its flag, one line per door', async () => {
    await mount();
    act(() => dossierButton().click());

    const dossier = screen.getByRole('dialog', { name: nationLabel('france') });
    expect(within(dossier).getByText('Théo · saison 1, jour 20 · 2ᵉ au classement')).toBeTruthy();
    expect(within(dossier).getByText(fr.dossier.nationNote(3))).toBeTruthy();
    expect(within(dossier).getByText(fr.dossier.gunnery)).toBeTruthy();
    expect(within(dossier).getByText(fr.dossier.settings)).toBeTruthy();
    expect(within(dossier).getByText(fr.settingsWindow.briefingLabel)).toBeTruthy();
  });

  it('opens a window from the dossier, and the dossier gives way', async () => {
    const router = await mount();
    act(() => dossierButton().click());
    await act(async () => screen.getByRole('link', { name: /Fiche de nation/ }).click());

    expect(router.state.location.search).toEqual({ windows: ['nation'] });
    expect(screen.queryByRole('dialog', { name: nationLabel('france') })).toBeNull();
  });

  it('trades the dossier for the layers sheet, nine toggles on two columns', async () => {
    await mount();
    act(() => dossierButton().click());
    act(() => screen.getByRole('button', { name: /Calques de la carte/ }).click());

    const layers = screen.getByRole('dialog', { name: fr.foot.layersTitle });
    expect(
      within(layers)
        .getAllByRole('button')
        .filter((toggle) => toggle.hasAttribute('aria-pressed')),
    ).toHaveLength(9);
    expect(screen.queryByRole('dialog', { name: nationLabel('france') })).toBeNull();
  });

  it('hands the briefing back to the board, which owns it', async () => {
    const showBriefing = vi.fn();
    await mount(showBriefing);
    act(() => dossierButton().click());
    act(() => screen.getByRole('button', { name: /Aide-mémoire du commandement/ }).click());

    expect(showBriefing).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: nationLabel('france') })).toBeNull();
  });
});
