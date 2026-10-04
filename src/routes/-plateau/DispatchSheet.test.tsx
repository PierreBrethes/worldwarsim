// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { journalDispatches } from '@/domain/journal';
import type { CombatReport } from '@/domain/player-view';
import { DispatchSheet } from './DispatchSheet';

/**
 * **L'arrivée sur une dépêche de combat** (lot mobile-3, §6). La feuille dit ce que le journal dit
 * déjà — pertes, terrain, avant-poste désactivé — et **ne nomme pas l'assaillant** : le compte
 * rendu ne le nomme pas, et aucune nation ne doit y paraître (ADR 0005).
 */
afterEach(cleanup);

const attacked: CombatReport = {
  id: 'engagement-1',
  at: Date.UTC(2026, 9, 4, 12, 5),
  cause: 'arrival',
  side: 'defender',
  won: false,
  hostCountry: 'FRA',
  point: { lon: 4.8, lat: 45.7 },
  outpostId: 'AP-01',
  outpostDisabled: true,
  mine: { troops: 1, lost: 50, routed: 0, destroyed: 1 },
  theirs: { troops: 2, lost: 12, routed: 0, destroyed: 0 },
  reduced: null,
};

const [dispatch] = journalDispatches([attacked], null, []);

it('dit les pertes et l’avant-poste désactivé, sans nommer l’assaillant', () => {
  render(
    <DispatchSheet
      dispatch={dispatch!}
      combat={attacked}
      onOpenGarrison={() => {}}
      onOpenJournal={() => {}}
      onClose={() => {}}
    />,
  );
  const sheet = screen.getByRole('dialog');
  expect(sheet.textContent).toContain(fr.stamps.dispatches.attacked);
  expect(sheet.textContent).toContain(fr.dispatchSheet.lossesValue(50, 1, 0));
  expect(sheet.textContent).toContain(fr.dispatchSheet.outpostDisabled);
  for (const nation of Object.values(fr.nations).filter((name) => name !== fr.nations.france))
    expect(sheet.textContent).not.toContain(nation);
  expect(screen.queryByRole('button', { name: /assaillant/i })).toBeNull();
});

it('n’offre la garnison que s’il en reste une, et garde le journal et « plus tard »', () => {
  const onClose = vi.fn();
  const onOpenJournal = vi.fn();
  render(
    <DispatchSheet
      dispatch={dispatch!}
      combat={attacked}
      onOpenGarrison={null}
      onOpenJournal={onOpenJournal}
      onClose={onClose}
    />,
  );
  expect(screen.queryByRole('button', { name: fr.dispatchSheet.openGarrison })).toBeNull();
  screen.getByRole('button', { name: fr.dispatchSheet.openJournal }).click();
  screen.getByRole('button', { name: fr.dispatchSheet.later }).click();
  expect(onOpenJournal).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});
