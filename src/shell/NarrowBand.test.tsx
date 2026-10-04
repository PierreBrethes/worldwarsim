// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { NarrowBand } from './ResourceBand';

/**
 * **Le bandeau du téléphone se replie sur sa ligne de nation** (piste A, A1 et A2) : déplié, huit
 * colonnes ; replié, la nation et les mouvements, et un toucher sur cette ligne ou sur la poignée
 * le rouvre. Le pli survit au rechargement, dans le réglage du bandeau de bureau.
 */
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const view = {
  loadedAt: Date.now(),
  me: {
    nation: 'france',
    defeated: false,
    slots: { total: 2, used: 0 },
    chains: [],
    buildings: [],
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 40, ratePerHour: 2, cap: 400 }]),
    ),
  },
} as unknown as PlayerView;

const columns = () =>
  RESOURCES.flatMap((resource) => screen.queryAllByTitle(fr.resources[resource]));

describe('the narrow band', () => {
  it('reads eight columns under the nation line', () => {
    render(<NarrowBand view={view} />);
    expect(columns()).toHaveLength(8);
    expect(screen.getByText(fr.banner.slotsCount(0, 2))).toBeTruthy();
    expect(screen.getByText(fr.resourceBand.abbreviations.alloy)).toBeTruthy();
  });

  it('folds to the nation line by its handle, and reopens from that line', () => {
    render(<NarrowBand view={view} />);

    act(() => screen.getByTitle(fr.resourceBand.collapse).click());
    expect(columns()).toHaveLength(0);
    expect(screen.getByText(fr.banner.slotsCount(0, 2))).toBeTruthy();
    expect(localStorage.getItem('wws-resource-band')).toBe('collapsed');

    const line = screen
      .getAllByTitle(fr.resourceBand.expand)
      .find((button) => button.textContent?.includes(fr.resourceBand.slots));
    act(() => line!.click());
    expect(columns()).toHaveLength(8);
  });

  it('opens a resource’s detail on a touch, never on a hover', () => {
    render(<NarrowBand view={view} />);
    act(() => screen.getByTitle(fr.resources.coal).click());
    expect(screen.getByText(/charbon · 40 \/ 400/)).toBeTruthy();
  });
});
