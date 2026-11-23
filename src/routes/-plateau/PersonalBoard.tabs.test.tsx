// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { setMapMotionSetting } from '@/data/mapMotion';
import { SoleSurfaceProvider } from '@/shell/sole-surface';
import { PersonalBoard } from './PersonalBoard';

/**
 * **Les onglets de l'étage des tuiles** (#590) : à la moitié et au plein, sous les tuiles, les
 * colonnes du volet du bureau — chantiers, stocks, tas, lots —, une à la fois. L'onglet est un état
 * local : « chantiers » d'abord, retenu tant que le plateau vit. Les huit premières lignes entrent
 * à l'ouverture de la feuille ; changer d'onglet n'est qu'un fondu.
 */
const client = {
  watchQuery: () => ({
    localQueryResult: () => undefined,
    onUpdate: () => () => {},
    journal: () => undefined,
  }),
  mutation: () => Promise.resolve(),
} as unknown as ConvexReactClient;

const animated: Element[] = [];
beforeEach(() => {
  localStorage.clear();
  animated.length = 0;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.animate = function (this: Element) {
    animated.push(this);
    return {} as Animation;
  };
  // The narrow screen and the touch, but no « reduced motion ».
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: !query.includes('reduced'),
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
});
afterEach(() => {
  setMapMotionSetting('auto');
  cleanup();
  vi.unstubAllGlobals();
});

const SEAT = { token: 't', seasonId: 's' } as unknown as Seat;
const work = (rank: number) => ({
  id: `W-${rank}`,
  name: `Ferme ${rank}`,
  key: 'farm',
  outpostId: null,
  regionId: 'FR-NOR',
  regionName: 'Nord',
  point: null,
  minutesLeft: 10,
  minutes: 20,
  level: 2,
});
const view = {
  loadedAt: 0,
  mode: 'mondiale',
  captures: [],
  arcs: [],
  boardRead: null,
  surveyedInstallations: [],
  buildCatalog: new Proxy({}, { get: () => ({ minutes: 1, cost: { steel: 10 }, lockedBy: null }) }),
  me: {
    nation: 'france',
    defeated: false,
    troops: [],
    stationedCargo: [],
    construction: work(1),
    constructionQueue: [2, 3, 4, 5, 6, 7, 8].map(work),
    recruiting: [],
    regions: [{ id: 'FR-NOR', name: 'Nord', linked: true }],
    buildings: [],
    foundation: [],
    extraction: [],
    evacuated: [],
    outposts: [],
    chains: [],
    hqLevel: 1,
    upkeep: {},
    research: { researched: [], running: null, queue: [] },
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 340, ratePerHour: 4, cap: 400 }]),
    ),
  },
} as unknown as PlayerView;

const Table = ({
  cue = null,
  front = true,
}: {
  cue?: { rack: 'tiles'; text: string; tile: 'farm' } | null;
  front?: boolean;
}) => (
  <ConvexProvider client={client}>
    <SoleSurfaceProvider>
      <PersonalBoard
        view={view}
        seat={SEAT}
        open={false}
        onOpen={() => {}}
        research={false}
        onResearch={() => {}}
        front={front}
        focused={null}
        site={null}
        onDeselectSite={() => {}}
        onOpenSiteSheet={() => {}}
        onHoldTile={() => {}}
        onPlaceTile={() => false}
        maquetteAt={null}
        placing={null}
        cue={cue}
      />
    </SoleSurfaceProvider>
  </ConvexProvider>
);

const stage = () => document.querySelector<HTMLElement>('[data-stage]')!;
/** Un doigt tire l'étage : positif vers le bas. */
const pull = (travel: number) =>
  act(() => {
    stage()
      .querySelector<HTMLElement>(':scope > div.cursor-grab')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 300, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 + travel }));
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 + travel }));
  });
const tabs = () => screen.queryAllByRole('tab', { hidden: true });
const tab = (name: string) => screen.getByRole('tab', { name, hidden: true });
const cancels = () =>
  screen.queryAllByRole('button', { name: /^Annuler .* : remboursé$/, hidden: true });

describe("the tiles' stage tabs", () => {
  it('has none at the row, and the four of the volet from the half, « chantiers » first', () => {
    render(<Table />);
    expect(tabs()).toHaveLength(0);
    pull(-120);
    expect(stage().dataset.height).toBe('half');
    expect(tabs().map((one) => one.textContent)).toEqual(['chantiers', 'stocks', 'tas', 'lots']);
    expect(tab('chantiers').getAttribute('aria-selected')).toBe('true');
    expect(tab('stocks').getAttribute('aria-selected')).toBe('false');
  });

  it('lists the one queue of works with a cancel for each line but the running head', () => {
    render(<Table />);
    pull(-120);
    expect(cancels()).toHaveLength(7);
    // No second list, no fold: the accordion « chantiers » is gone.
    expect(
      screen.queryByRole('button', { name: fr.personalBoard.worksHeader, hidden: true }),
    ).toBeNull();
    expect(
      screen.getAllByRole('list', { name: fr.personalBoard.worksHeader, hidden: true }),
    ).toHaveLength(1);
  });

  it('shows one tab at a time and keeps the chosen one through a fold and a climb', () => {
    render(<Table />);
    pull(-120);
    fireEvent.click(tab('stocks'));
    expect(cancels()).toHaveLength(0);
    expect(screen.getAllByText('/ 400', { exact: false })).toHaveLength(RESOURCES.length);
    fireEvent.click(tab('tas'));
    expect(screen.getByText(fr.personalBoard.harvestHeader)).toBeTruthy();
    fireEvent.click(tab('lots'));
    expect(screen.getByText(fr.personalBoard.noLots)).toBeTruthy();
    pull(120);
    expect(tabs()).toHaveLength(0);
    pull(-120);
    expect(tab('lots').getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the same tabs at the full step, which the stage now offers', () => {
    render(<Table />);
    pull(-120);
    pull(-120);
    expect(stage().dataset.height).toBe('full');
    expect(tabs()).toHaveLength(4);
    expect(within(stage()).getAllByRole('tab', { hidden: true })).toHaveLength(4);
  });

  it('enters the first eight lines when the sheet opens, and only fades on a tab change', () => {
    render(<Table />);
    pull(-120);
    const lines = animated.filter((one) => one.classList.contains('mat-line'));
    expect(lines).toHaveLength(8);
    animated.length = 0;
    fireEvent.click(tab('stocks'));
    expect(animated).toHaveLength(0);
    expect(screen.getByRole('tabpanel', { hidden: true }).className).toContain('tab-fade');
    // Half to full is no opening: the sheet was already open.
    pull(-120);
    expect(animated).toHaveLength(0);
  });

  it('plays no fade on the first tab, only on a change', () => {
    render(<Table />);
    pull(-120);
    expect(screen.getByRole('tabpanel', { hidden: true }).className).not.toContain('tab-fade');
  });

  it('with reduced motion enters no cascade, but still fades a tab change', () => {
    setMapMotionSetting('reduced');
    render(<Table />);
    pull(-120);
    expect(animated.filter((one) => one.classList.contains('mat-line'))).toHaveLength(0);
    fireEvent.click(tab('stocks'));
    expect(screen.getByRole('tabpanel', { hidden: true }).className).toContain('tab-fade');
  });

  it('with motion off enters no cascade and plays no fade', () => {
    setMapMotionSetting('off');
    render(<Table />);
    pull(-120);
    expect(animated).toHaveLength(0);
    fireEvent.click(tab('stocks'));
    expect(screen.getByRole('tabpanel', { hidden: true }).className).not.toContain('tab-fade');
  });
});

describe("the tiles' row at the full step", () => {
  const first = () => screen.getByRole('button', { name: /^Ferme — /, hidden: true });

  it('keeps the whole tiles at the row and the half, and only names and figures at the full', () => {
    render(<Table />);
    expect(first().textContent).toContain('min');
    pull(-120);
    expect(first().textContent).toContain('min');
    pull(-120);
    expect(stage().dataset.height).toBe('full');
    expect(first().textContent).toBe('Ferme');
    pull(120);
    expect(first().textContent).toContain('min');
  });

  it('fades into the compact form, and only changes it with motion off', () => {
    render(<Table />);
    const row = () => first().closest('section')!;
    pull(-120);
    expect(row().className).not.toContain('tab-fade');
    pull(-120);
    expect(row().className).toContain('tab-fade');
    cleanup();
    setMapMotionSetting('off');
    render(<Table />);
    pull(-120);
    pull(-120);
    expect(first().closest('section')!.className).not.toContain('tab-fade');
  });

  it('puts the first-step bubble on the row and the half, never over the full step', () => {
    render(<Table cue={{ rack: 'tiles', text: 'Pose une ferme', tile: 'farm' }} />);
    expect(screen.queryByText('Pose une ferme')).toBeTruthy();
    pull(-120);
    expect(screen.queryByText('Pose une ferme')).toBeTruthy();
    pull(-120);
    expect(stage().dataset.height).toBe('full');
    expect(screen.queryByText('Pose une ferme')).toBeNull();
  });

  /** #607 : une fenêtre devant la bande masque la bulle, et sa fermeture la rend. */
  it('hides the first-step bubble under a window, and brings it back after', () => {
    const cue = { rack: 'tiles', text: 'Pose une ferme', tile: 'farm' } as const;
    const { rerender } = render(<Table cue={cue} />);
    expect(screen.queryByText('Pose une ferme')).toBeTruthy();
    rerender(<Table cue={cue} front={false} />);
    expect(screen.queryByText('Pose une ferme')).toBeNull();
    rerender(<Table cue={cue} />);
    expect(screen.queryByText('Pose une ferme')).toBeTruthy();
  });
});
