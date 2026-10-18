// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { fr, roleLabel } from '@/i18n/fr';
import { journalDispatches } from '@/domain/journal';
import type { CombatReport, ReplayView } from '@/domain/player-view';
import { ReplayAccount, ReplayButton, ReplayLaunch } from './ReplayDeck';

/**
 * **Le rejeu se lance d'une dépêche de combat, et d'elle seule** ; son compte rendu dit chez moi
 * par rôle et en face des totaux, jamais un rôle adverse (ADR 0005).
 */
afterEach(cleanup);

const combat: CombatReport = {
  id: 'engagement-1',
  at: Date.UTC(2026, 9, 4, 12, 5),
  cause: 'arrival',
  side: 'attacker',
  won: true,
  hostCountry: 'FRA',
  point: { lon: 4.8, lat: 45.7 },
  outpostId: null,
  outpostDisabled: false,
  mine: { troops: 3, lost: 40, routed: 0, destroyed: 1 },
  theirs: { troops: 2, lost: 90, routed: 1, destroyed: 1 },
  reduced: null,
};

const [fought, entered] = journalDispatches([combat], null, [
  {
    kind: 'constructionCancelled',
    at: combat.at - 1000,
    building: 'farm',
    regionName: 'Marne',
  },
]);

it('porte « rejouer » sur une dépêche de combat, pas ailleurs, et dit le refus sur place', async () => {
  const launch = vi.fn(async () => fr.errors.NOT_A_PARTY());
  render(
    <ReplayLaunch.Provider value={launch}>
      <div data-testid="combat">
        <ReplayButton dispatch={fought!} className="" />
      </div>
      <div data-testid="other">
        <ReplayButton dispatch={entered!} className="" />
      </div>
    </ReplayLaunch.Provider>,
  );
  expect(within(screen.getByTestId('other')).queryByRole('button')).toBeNull();
  within(screen.getByTestId('combat')).getByRole('button', { name: fr.replay.play }).click();
  expect(launch).toHaveBeenCalledWith(fought);
  await waitFor(() => screen.getByText(fr.errors.NOT_A_PARTY()));
});

it('n’existe pas sans plateau pour le lancer', () => {
  render(<ReplayButton dispatch={fought!} className="" />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('compte chez moi par rôle et en face en totaux', () => {
  const view: ReplayView = {
    combatId: combat.id,
    at: combat.at,
    point: combat.point,
    side: 'attacker',
    won: true,
    mine: [
      { role: 'infantry', tier: 1, troops: 2, lost: 30, routed: 0, destroyed: 1 },
      { role: 'armor', tier: 2, troops: 1, lost: 10, routed: 0, destroyed: 0 },
    ],
    theirs: combat.theirs,
  };
  render(<ReplayAccount view={view} said={fought!.text} />);
  screen.getByText(fought!.text);
  // The pass in its two beats: my strike took 90 of theirs, their riposte 40 of mine.
  screen.getByText('notre frappe en abat 90, leur riposte en abat 40');
  screen.getByText(fr.replay.held);
  const rows = screen.getAllByRole('row').slice(1);
  const lines = rows.map((row) => row.textContent);
  expect(lines).toEqual([
    fr.replay.mine,
    `${roleLabel('infantry', 2)} MK1` + '23001',
    `${roleLabel('armor', 1)} MK2` + '11000',
    fr.replay.theirs + '29011',
  ]);
});

it('compte en face par rôle sous sa nation, quand on l’a vue au feu (F1)', () => {
  const view: ReplayView = {
    combatId: combat.id,
    at: combat.at,
    point: combat.point,
    side: 'attacker',
    won: true,
    mine: [{ role: 'infantry', tier: 1, troops: 3, lost: 40, routed: 0, destroyed: 1 }],
    theirs: combat.theirs,
    faced: {
      nation: 'germany',
      forces: [
        { role: 'armor', tier: 1, troops: 2, strength: 24, lost: 90, routed: 1, destroyed: 1 },
      ],
    },
  };
  render(<ReplayAccount view={view} said={fought!.text} />);
  const lines = screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.textContent);
  expect(lines).toEqual([
    fr.replay.mine,
    `${roleLabel('infantry', 3)} MK1` + '34001',
    fr.nations.germany,
    `${roleLabel('armor', 2)} MK1` + '29011',
  ]);
});
