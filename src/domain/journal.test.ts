import { describe, expect, it } from 'vitest';
import { journalDispatches } from './journal';
import type { CombatReport, Notice } from './player-view';

/**
 * **Deux flux, une liste.** Les engagements disent les batailles, les notices disent tout le
 * reste ; la fusion se fait par l'heure et par rien d'autre — un journal trié par flux
 * raconterait deux histoires parallèles, alors que le joueur en lit une seule : la sienne, à
 * rebours.
 *
 * Et **le non-lu ne dépend que de `journalReadAt`** : pas d'indicateur par dépêche, parce que la
 * liste est reconstruite à chaque chargement et qu'un ensemble d'identifiants lus dériverait
 * d'elle à la première reformulation.
 */
const HOUR = 3_600_000;
const NOON = new Date(2026, 7, 17, 12, 0, 0).getTime();

const battle = (at: number): CombatReport => ({
  id: `engagement-${at}`,
  at,
  cause: 'arrival',
  side: 'attacker',
  won: true,
  hostCountry: 'ROU',
  outpostDisabled: false,
  mine: { troops: 2, lost: 4, routed: 0, destroyed: 0 },
  theirs: { troops: 1, lost: 30, routed: 1, destroyed: 0 },
  reduced: null,
});

const finished = (at: number): Notice => ({
  kind: 'constructionFinished',
  at,
  building: 'barracks',
  regionName: 'Marne',
  level: 1,
});

describe('the journal', () => {
  it('merges the two streams by hour, newest first', () => {
    const dispatches = journalDispatches(
      [battle(NOON - 2 * HOUR), battle(NOON)],
      null,
      [],
      [finished(NOON - HOUR), finished(NOON - 3 * HOUR)],
    );

    expect(dispatches.map((dispatch) => dispatch.at)).toEqual([
      NOON,
      NOON - HOUR,
      NOON - 2 * HOUR,
      NOON - 3 * HOUR,
    ]);
  });

  it('reads unread off journalReadAt and nothing else', () => {
    const stream = [finished(NOON - 3 * HOUR), finished(NOON - HOUR)];

    const never = journalDispatches([battle(NOON)], null, [], stream);
    expect(never.every((dispatch) => dispatch.unread)).toBe(true);

    const midway = journalDispatches([battle(NOON)], null, [], stream, NOON - 2 * HOUR);
    expect(midway.map((dispatch) => dispatch.unread)).toEqual([true, true, false]);

    const caughtUp = journalDispatches([battle(NOON)], null, [], stream, NOON);
    expect(caughtUp.some((dispatch) => dispatch.unread)).toBe(false);
  });

  /** L'heure de passage à la frontière est la seule qui regarde vers l'avant : c'est ce que la
   *  colonne « au réveil » lit, et elle lit `resolutionAt`, jamais le texte. */
  it('carries the hour a held column goes through, and only for that kind', () => {
    const stalled: Notice = {
      kind: 'movementStalled',
      at: NOON,
      hostCountry: 'RUS',
      resolvesAt: NOON + 5 * HOUR,
    };
    const [waking, built] = journalDispatches([], null, [], [stalled, finished(NOON - HOUR)]);

    expect(waking!.resolutionAt).not.toBeNull();
    expect(built!.resolutionAt).toBeNull();
  });

  /**
   * Le relevé ne porte ni type, ni composition, ni nation de la colonne — la notice ne les a pas
   * (`convex/validators.ts`), donc la phrase ne peut pas les dire. C'est la condition d'existence
   * du leurre. Le pays qu'elle nomme est **celui d'où l'on a regardé**, et la phrase le dit.
   */
  it('words a sighting from the sentry, with a place and a heading', () => {
    const [sighted] = journalDispatches(
      [],
      null,
      [],
      [
        {
          kind: 'movementSighted',
          at: NOON,
          hostCountry: 'FRA',
          headingDegrees: 45,
          detector: 'troop',
          detectorRegion: null,
        },
      ],
    );

    expect(sighted!.text).toContain('inconnue');
    expect(sighted!.text).toContain('guetteurs');
    expect(sighted!.text).toContain('NE');
  });

  /**
   * **Les deux faces d'une même minute.** Celui qui a éventé le leurre n'apprend rien de plus
   * qu'avant sur son adversaire — pas la nation, pas ce qu'elle prépare — seulement que ce fil-là
   * ne portait personne ; son propriétaire, lui, sait que sa feinte est lue. Aucune des deux
   * phrases ne nomme l'autre joueur.
   */
  it('words the two faces of a spent decoy without naming anybody', () => {
    const [exposed] = journalDispatches(
      [],
      null,
      [],
      [{ kind: 'decoyExposed', at: NOON, hostCountry: 'ROU' }],
    );
    expect(exposed!.text).toContain('leurre');
    expect(exposed!.severity).toBe('notable');

    const [blown] = journalDispatches(
      [],
      null,
      [],
      [{ kind: 'decoyBlown', at: NOON, hostCountry: 'ROU' }],
    );
    expect(blown!.text).toContain('éventé');
  });

  /** La colonne bredouille : sans cette dépêche, la plus longue marche d'une saison se lit
   *  « rien à signaler ». */
  it('words the arrival that found nobody', () => {
    const [nothing] = journalDispatches(
      [],
      null,
      [],
      [
        {
          kind: 'columnFoundNothing',
          at: NOON,
          movementType: 'attack',
          hostCountry: 'ROU',
          troops: 3,
        },
      ],
    );
    expect(nothing!.text).toContain('personne');
    expect(nothing!.severity).toBe('notable');
  });
});
