// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { journalDispatches } from '@/domain/journal';
import type { CombatReport } from '@/domain/player-view';
import { CombatToasts } from './CombatToasts';
import { ReplayLaunch } from './ReplayDeck';

/**
 * **Le toast ne dit que ce qui arrive pendant qu'on regarde** : rien au chargement, rien pendant
 * un rejeu, et il porte la phrase de la dépêche, « rejouer », « voir » et sa croix. Le système
 * y demande moins de mouvement : l'encart part sans attendre une animation que jsdom ne joue pas.
 */
let narrow = true;
beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow || !query.includes('max-width'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
});
afterEach(() => {
  cleanup();
  narrow = true;
  vi.useRealTimers();
});

const battle = (id: string, at: number): CombatReport => ({
  id,
  at,
  cause: 'arrival',
  side: 'defender',
  won: false,
  hostCountry: 'FRA',
  point: { lon: 4.8, lat: 45.7 },
  outpostId: null,
  outpostDisabled: false,
  mine: { troops: 3, lost: 40, routed: 0, destroyed: 1 },
  theirs: { troops: 2, lost: 90, routed: 1, destroyed: 1 },
});

const NOON = Date.UTC(2026, 9, 13, 12);
const opened = journalDispatches([battle('old', NOON)], null);
const later = journalDispatches([battle('old', NOON), battle('new', NOON + 60_000)], null);
const fresh = later.find((dispatch) => dispatch.combat?.id === 'new')!;

const board = (journal: typeof later, quiet = false, onShow = vi.fn()) => (
  <ReplayLaunch.Provider value={async () => null}>
    <CombatToasts journal={journal} quiet={quiet} onShow={onShow} />
  </ReplayLaunch.Provider>
);

it('se tait sur ce que la carte a ouvert', () => {
  render(board(later));
  expect(screen.queryByRole('status')).toBeNull();
});

it('imprime le combat arrivé, avec rejouer, voir et la croix', () => {
  const onShow = vi.fn();
  const { rerender } = render(board(opened, false, onShow));
  rerender(board(later, false, onShow));
  screen.getByText(fresh.text);
  screen.getByRole('button', { name: fr.replay.play });
  screen.getByRole('button', { name: fr.combatToast.show }).click();
  expect(onShow).toHaveBeenCalledWith(fresh.combat);
  act(() => screen.getByRole('button', { name: fr.combatToast.close }).click());
  expect(screen.queryByText(fresh.text)).toBeNull();
});

it('se ferme seul', () => {
  vi.useFakeTimers();
  const { rerender } = render(board(opened));
  rerender(board(later));
  screen.getByText(fresh.text);
  act(() => vi.advanceTimersByTime(8_000));
  expect(screen.queryByText(fresh.text)).toBeNull();
});

it('ne dit rien pendant un rejeu, ni après de ce qui est arrivé pendant', () => {
  const { rerender } = render(board(opened, true));
  rerender(board(later, true));
  expect(screen.queryByRole('status')).toBeNull();
  rerender(board(later, false));
  expect(screen.queryByRole('status')).toBeNull();
});

const four = journalDispatches(
  [battle('old', NOON), ...[1, 2, 3, 4].map((n) => battle(`b${n}`, NOON + n * 60_000))],
  null,
);
const timeOf = (id: string) => four.find((dispatch) => dispatch.combat?.id === id)!.t;

it('en garde trois au bureau, le plus récent en tête', () => {
  narrow = false;
  const { rerender } = render(board(opened));
  rerender(board(four));
  const shown = screen.getAllByRole('status').map((toast) => toast.textContent);
  expect(shown).toHaveLength(3);
  ['b4', 'b3', 'b2'].forEach((id, rank) => expect(shown[rank]).toContain(timeOf(id)));
});

it('au téléphone, un seul à la fois : le plus récent, puis le suivant', () => {
  const { rerender } = render(board(opened));
  rerender(board(four));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  screen.getByText(timeOf('b4'));
  act(() => screen.getByRole('button', { name: fr.combatToast.close }).click());
  screen.getByText(timeOf('b3'));
});
