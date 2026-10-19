import { describe, expect, it } from 'vitest';
import { combatsSince, isAlarm, journalDispatches, latestDispatchAt } from './journal';
import { fr } from '@/i18n/fr';
import type { BuildingKey } from './ids';
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
  point: { lon: 26, lat: 45 },
  outpostId: null,
  outpostDisabled: false,
  mine: { troops: 2, lost: 4, routed: 0, destroyed: 0 },
  theirs: { troops: 1, lost: 30, routed: 1, destroyed: 0 },
});

const finished = (at: number): Notice => ({
  kind: 'constructionFinished',
  at,
  building: 'barracks',
  regionName: 'Marne',
  level: 1,
});

describe('the journal', () => {
  /** « Localiser » recentres the map on `place`: a fight is where it was held, a notice is where
   *  the server said, and what happened nowhere points nowhere. */
  it('places each dispatch where it happened', () => {
    const placed = { ...finished(NOON - HOUR), place: { lon: 2.5, lat: 49.1 } };
    const dispatches = journalDispatches(
      [battle(NOON)],
      { concludedAt: NOON - 3 * HOUR, winnerNation: 'france' },
      [placed, finished(NOON - 2 * HOUR)],
    );

    expect(dispatches.map((dispatch) => dispatch.place)).toEqual([
      { lon: 26, lat: 45 },
      { lon: 2.5, lat: 49.1 },
      null,
      null,
    ]);
  });

  it('tells a bombardment on both sides, with no riposte', () => {
    const shot = {
      ...battle(NOON),
      cause: 'bombardment' as const,
      mine: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
      theirs: { troops: 1, lost: 30, routed: 0, destroyed: 0 },
    };
    const struck = {
      ...shot,
      side: 'defender' as const,
      won: false,
      mine: shot.theirs,
      theirs: shot.mine,
    };
    const [fired] = journalDispatches([shot], null, []);
    const [taken] = journalDispatches([struck], null, []);
    expect(fired!.text).toMatch(/^bombardement .* notre tir en abat 30, sans riposte possible$/);
    expect(taken!.text).toMatch(/^bombardés .* leur tir en abat 30, aucune riposte possible$/);
    expect(taken!.kind).toBe('attacked');
  });

  it('names the nation and the roles faced at the fire, on both sides (F1)', () => {
    const fought: CombatReport = {
      ...battle(NOON),
      theirs: { troops: 3, lost: 30, routed: 0, destroyed: 0 },
      faced: {
        nation: 'germany',
        forces: [
          { role: 'armor', tier: 1, troops: 1, strength: 12, lost: 0, routed: 0, destroyed: 0 },
          { role: 'infantry', tier: 1, troops: 1, strength: 50, lost: 20, routed: 0, destroyed: 0 },
          { role: 'infantry', tier: 2, troops: 1, strength: 50, lost: 10, routed: 0, destroyed: 0 },
        ],
      },
    };
    const [said] = journalDispatches([fought], null, []);
    expect(said!.text).toContain(
      '2 contre 3 — en face, Allemagne : blindé ×1 (12 machines), infanterie ×2 (100 hommes)',
    );
    const [old] = journalDispatches([battle(NOON)], null, []);
    expect(old!.text).toContain('2 contre 1, ');
  });

  it('names the target of a bombardment to the gunner, and the gunner to nobody (F1)', () => {
    const shot: CombatReport = {
      ...battle(NOON),
      cause: 'bombardment',
      faced: {
        nation: 'ussr',
        forces: [
          { role: 'infantry', tier: 1, troops: 1, strength: 50, lost: 30, routed: 0, destroyed: 0 },
        ],
      },
    };
    const [fired] = journalDispatches([shot], null, []);
    expect(fired!.text).toContain('sur URSS : infanterie ×1 (50 hommes)');
  });

  it('merges the two streams by hour, newest first', () => {
    const dispatches = journalDispatches([battle(NOON - 2 * HOUR), battle(NOON)], null, [
      finished(NOON - HOUR),
      finished(NOON - 3 * HOUR),
    ]);

    expect(dispatches.map((dispatch) => dispatch.at)).toEqual([
      NOON,
      NOON - HOUR,
      NOON - 2 * HOUR,
      NOON - 3 * HOUR,
    ]);
  });

  it('reads unread off journalReadAt and nothing else', () => {
    const stream = [finished(NOON - 3 * HOUR), finished(NOON - HOUR)];

    const never = journalDispatches([battle(NOON)], null, stream);
    expect(never.every((dispatch) => dispatch.unread)).toBe(true);

    const midway = journalDispatches([battle(NOON)], null, stream, NOON - 2 * HOUR);
    expect(midway.map((dispatch) => dispatch.unread)).toEqual([true, true, false]);

    const caughtUp = journalDispatches([battle(NOON)], null, stream, NOON);
    expect(caughtUp.some((dispatch) => dispatch.unread)).toBe(false);
  });

  it('words a cancelled outpost raise without throwing', () => {
    const [cancelled] = journalDispatches([], null, [
      { kind: 'constructionCancelled', at: NOON, building: 'outpost', regionName: 'Marne' },
    ]);
    expect(cancelled!.text).toContain(fr.garrison.raiseWork);
    expect(cancelled!.text).not.toContain('undefined');
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
    const [waking, built] = journalDispatches([], null, [stalled, finished(NOON - HOUR)]);

    expect(waking!.resolutionAt).not.toBeNull();
    expect(built!.resolutionAt).toBeNull();
  });

  /**
   * Le relevé ne porte ni type, ni composition, ni nation de la colonne — la notice ne les a pas
   * (`convex/validators.ts`), donc la phrase ne peut pas les dire. Le pays qu'elle nomme est
   * **celui d'où l'on a regardé**, et la phrase le dit.
   */
  it('words a sighting from the sentry, with a place and a heading', () => {
    const [sighted] = journalDispatches([], null, [
      {
        kind: 'movementSighted',
        at: NOON,
        hostCountry: 'FRA',
        headingDegrees: 45,
        detector: 'troop',
        detectorRegion: null,
      },
    ]);

    expect(sighted!.text).toContain('inconnue');
    expect(sighted!.text).toContain('guetteurs');
    expect(sighted!.text).toContain('NE');
  });

  /** La colonne bredouille : sans cette dépêche, la plus longue marche d'une saison se lit
   *  « rien à signaler ». */
  it('words the arrival that found nobody', () => {
    const [nothing] = journalDispatches([], null, [
      {
        kind: 'columnFoundNothing',
        at: NOON,
        movementType: 'attack',
        hostCountry: 'ROU',
        troops: 3,
      },
    ]);
    expect(nothing!.text).toContain('personne');
    expect(nothing!.severity).toBe('notable');
  });

  /**
   * **Le trou d'affordance de la partie de contrôle** (retours du 11/09, ligne 5) : le joueur
   * venait saboter une mine, l'attaque est arrivée sur une région sans garnison, et la dépêche
   * lui a dit « n'a trouvé personne » — rien sur la mine, rien sur l'ordre qui l'atteint. Elle le
   * dit maintenant, et seulement pour ce qu'un ordre atteint : la même fonction que la rose lit.
   */
  it('names the surveyed installation the bredouille column is standing next to', () => {
    const dispatchOf = (installation?: BuildingKey) =>
      journalDispatches([], null, [
        {
          kind: 'columnFoundNothing',
          at: NOON,
          movementType: 'attack',
          hostCountry: 'ROU',
          troops: 3,
          ...(installation === undefined ? {} : { installation }),
        },
      ])[0]!;

    const mine = dispatchOf('mine');
    expect(mine.text).toContain('mine');
    expect(mine.text).toContain('saboter');

    const warehouse = dispatchOf('warehouse');
    expect(warehouse.text).toContain('piller');

    /** Une caserne ne se pille ni ne se sabote : la dépêche se tait plutôt que de promettre un
     *  ordre que la rose refuserait. */
    expect(dispatchOf('barracks').text).toBe(dispatchOf().text);
  });

  /**
   * **Une capitulation se lit comme une entrée en guerre, par l'autre bout** : la table change,
   * et le journal est le seul canal qui l'annonce. Le passage de commandement, lui, reste
   * routinier — le titre a changé de main, la guerre n'a pas bougé.
   */
  it('words a surrender loudly and the command it passes soberly', () => {
    const [surrendered, transferred] = journalDispatches([], null, [
      { kind: 'playerSurrendered', at: NOON, nation: 'ussr' },
      { kind: 'commandTransferred', at: NOON - HOUR, nation: 'germany' },
    ]);

    expect(surrendered!.text).toContain('CAPITULE');
    expect(surrendered!.text).toContain(fr.nations.ussr.toUpperCase());
    expect(surrendered!.severity).toBe('critical');
    expect(isAlarm(surrendered!.kind)).toBe(false);

    expect(transferred!.text).toContain(fr.nations.germany);
    expect(transferred!.text).toContain('direction de la partie');
    expect(transferred!.severity).toBe('routine');
  });

  /** **La course se lit par toute la table** (P2) : qui prend quel point, là où il est. */
  it('says who takes which strategic point, where it stands', () => {
    const [taken] = journalDispatches([], null, [
      {
        kind: 'pointTaken',
        at: NOON,
        key: 'narvik',
        nation: 'germany',
        place: { lon: 17.43, lat: 68.44 },
      },
    ]);
    expect(taken!.text).toBe(`${fr.nations.germany} prend Narvik.`);
    expect(taken!.place).toEqual({ lon: 17.43, lat: 68.44 });
  });

  /** En Mondiale, la chute d'un QG ne dissout rien : le reste passe aux irréguliers (M16), et
   *  toute la table l'apprend, puisque chacun peut le prendre. */
  it('says where a Mondiale elimination leaves the rest, to the parties and to the table', () => {
    const fall = { kind: 'playerEliminated', at: NOON, nation: 'ussr', irregulars: true } as const;
    const [aside] = journalDispatches([], null, [fall]);
    const [mine] = journalDispatches([], null, [{ ...fall, by: 'france' }]);

    expect(aside!.text).toContain('irréguliers');
    expect(mine!.text).toContain('irréguliers');
    expect(mine!.text).not.toContain('dissoutes');
  });
});

/**
 * **La sorte, à côté de la gravité et jamais déduite d'elle.** C'est ce que la marge du journal
 * tamponne (`shell/Stamp.tsx`), et c'est la seule chose qui sépare d'un coup d'œil un assaut mené
 * d'un assaut subi — deux nouvelles d'une même passe, de même gravité.
 */
describe('the sort a dispatch is stamped with', () => {
  it('splits the two faces of one pass, and only the suffered one is an alarm', () => {
    const [led] = journalDispatches([battle(NOON)], null);
    const [suffered] = journalDispatches([{ ...battle(NOON), side: 'defender' }], null);

    expect(led!.kind).toBe('assault');
    expect(suffered!.kind).toBe('attacked');
    expect(isAlarm(led!.kind)).toBe(false);
    expect(isAlarm(suffered!.kind)).toBe(true);
  });

  /** Les quatre encres rouges de la règle, et pas une cinquième : ce qu'on a subi, ce qu'on a
   *  perdu, ce qui a manqué en tirant, ce qu'on a vu passer. */
  it('reserves the red ink for the four sorts that ask for a decision now', () => {
    const alarms: ReadonlyArray<Notice> = [
      { kind: 'outpostDisabled', at: NOON, hostCountry: 'ROU', specialization: 'listening' },
      { kind: 'firedDry', at: NOON, hostCountry: 'ROU' },
      {
        kind: 'movementSighted',
        at: NOON,
        hostCountry: 'ROU',
        headingDegrees: 90,
        detector: 'troop',
        detectorRegion: null,
      },
    ];
    for (const notice of alarms) {
      expect(isAlarm(journalDispatches([], null, [notice])[0]!.kind)).toBe(true);
    }

    const quiet: ReadonlyArray<Notice> = [
      finished(NOON),
      { kind: 'outpostFounded', at: NOON, hostCountry: 'ROU', specialization: 'relay' },
      { kind: 'columnArrived', at: NOON, movementType: 'march', hostCountry: 'ROU', troops: 2 },
    ];
    for (const notice of quiet) {
      expect(isAlarm(journalDispatches([], null, [notice])[0]!.kind)).toBe(false);
    }
  });

  /** Une saison close se relit, elle ne se joue plus : elle n'exige plus rien de personne, donc
   *  pas d'encre rouge — c'est la limite de la règle, et elle se vérifie. */
  it('leaves the concluded season to the plain ink', () => {
    const [closed] = journalDispatches([], { concludedAt: NOON, winnerNation: 'france' });
    expect(closed!.kind).toBe('seasonConcluded');
    expect(isAlarm(closed!.kind)).toBe(false);
  });

  it('names who took the HQ to the two sides only (B10)', () => {
    const [aside] = journalDispatches([], null, [
      { kind: 'playerEliminated', at: NOON, nation: 'ussr' },
    ]);
    expect(aside!.text).not.toMatch(/France|vainqueur/);
    const [mine] = journalDispatches([], null, [
      { kind: 'playerEliminated', at: NOON, nation: 'ussr', by: 'france' },
    ]);
    expect(mine!.text).toMatch(/France/);
  });

  it('says why a Blitz ended, a draw included (B10, B11)', () => {
    const board = { target: 1, concludedAt: NOON, winnerNation: null, standings: [] };
    const [draw] = journalDispatches([], {
      ...board,
      verdict: { reason: 'draw', winnerNation: null, perMinute: 40 },
    });
    expect(draw!.text).toMatch(/égalité/);
    const [income] = journalDispatches([], {
      ...board,
      winnerNation: 'france',
      verdict: { reason: 'income', winnerNation: 'france', perMinute: 40 },
    });
    expect(income!.text).toMatch(/40 fonds par minute/);
  });

  /** Chaque sorte a son mot : un tampon sans libellé serait un cadre vide dans la marge. */
  it('gives every sort a label of its own', () => {
    const labels = Object.values(fr.stamps.dispatches);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('the combats a map toast announces', () => {
  const journal = journalDispatches([battle(NOON), battle(NOON + HOUR)], null, [
    finished(NOON + 2 * HOUR),
  ]);

  it('keeps out what the map opened with', () => {
    expect(combatsSince(journal, latestDispatchAt(journal))).toEqual([]);
  });

  it('takes the combats arrived since, and no other dispatch', () => {
    expect(combatsSince(journal, NOON).map((dispatch) => dispatch.at)).toEqual([NOON + HOUR]);
  });

  it('starts from nothing on an empty journal', () => {
    expect(latestDispatchAt([])).toBe(0);
  });
});

describe('a research card at its end', () => {
  it('is a notable dispatch that names the card and what it opens', () => {
    const [done] = journalDispatches([], null, [{ kind: 'researchDone', at: 1, card: 'armor' }]);
    expect(done).toMatchObject({ kind: 'research', severity: 'notable' });
    expect(done?.text).toContain('« Blindé »');
    expect(done?.text).toContain('le blindé MK1');
  });
});
