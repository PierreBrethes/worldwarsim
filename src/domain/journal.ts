import { asLocalTime } from './duration';
import { countryLabel, fr } from '../i18n/fr';
import { isNation } from './nations';
import type {
  CombatReport,
  JournalDispatch,
  Notice,
  ReductionBoard,
  WarEntry,
} from './player-view';

/**
 * **The journal is written here, from the account the server keeps** — never from a second
 * resolution of the pass. The server sends ids and numbers (ADR 0016); the French is put on them
 * at the last moment, which is also the only way "j'en perds 16, il en perd 22" ends up phrased
 * once instead of in every panel that shows a battle.
 */
export function journalDispatches(
  reports: ReadonlyArray<CombatReport>,
  reduction: ReductionBoard | null,
  entries: ReadonlyArray<WarEntry>,
  notices: ReadonlyArray<Notice> = [],
): ReadonlyArray<JournalDispatch> {
  const concluded: ReadonlyArray<JournalDispatch> =
    reduction === null || reduction.concludedAt === null || reduction.winnerNation === null
      ? []
      : [
          {
            t: asLocalTime(reduction.concludedAt),
            severity: 'critical',
            text: fr.victory.concluded(nationName(reduction.winnerNation)),
            replay: null,
            remaining: null,
            resolutionAt: null,
          },
        ];

  /**
   * **"X a réduit Y", named and read by everyone.** The test victory is public where design
   * sheet 05 keeps a doctrine secret, and that is the whole intent (`domain/victory.ts`): a
   * skirmish between friends wants the ribbing, and a secret with nothing behind it protects
   * nothing.
   */
  const reductions: ReadonlyArray<JournalDispatch> = [...reports]
    .sort((a, b) => b.at - a.at)
    .flatMap((report) =>
      report.reduced === null
        ? []
        : [
            {
              t: asLocalTime(report.at),
              severity: 'critical' as const,
              text: fr.victory.dispatch(
                nationName(report.reduced.by),
                nationName(report.reduced.whom),
              ),
              replay: null,
              remaining: null,
              resolutionAt: null,
            },
          ],
    );

  /**
   * **One more nation walks into the war** — a headline, and critical like everything else that
   * changes the table: this is the only announcement a player ever gets of it, and it carries
   * the hour because a late entry is read by the hour it happened.
   */
  const arrivals: ReadonlyArray<JournalDispatch> = [...entries]
    .sort((a, b) => b.at - a.at)
    .map((entry) => ({
      t: asLocalTime(entry.at),
      severity: 'critical' as const,
      text: fr.journal.warEntry(entry.nickname, nationName(entry.nation)),
      replay: null,
      remaining: null,
      resolutionAt: null,
    }));

  /**
   * **A chantier the world took back.** An entry of the construction queue is accepted against
   * the state at the enqueue; if the right has gone by the time its turn comes — a region lost,
   * a ceiling that came down — the server cancels it, refunds it whole and files this. Notable
   * rather than critical: nothing was lost but the turn, and the matter is back in the reserve.
   */
  const cancelled: ReadonlyArray<JournalDispatch> = [...notices]
    .sort((a, b) => b.at - a.at)
    .map((notice) => ({
      t: asLocalTime(notice.at),
      severity: 'notable' as const,
      text: fr.journal.constructionCancelled(fr.buildings[notice.building], notice.regionName),
      replay: null,
      remaining: null,
      resolutionAt: null,
    }));

  return [...concluded, ...reductions, ...arrivals, ...cancelled, ...combatOnly(reports)];
}

function combatOnly(reports: ReadonlyArray<CombatReport>): ReadonlyArray<JournalDispatch> {
  return [...reports]
    .sort((a, b) => b.at - a.at)
    .map((report) => ({
      t: asLocalTime(report.at),
      severity: severityOf(report),
      text: fr.combat.dispatch({
        where: countryLabel(report.hostCountry),
        intercepted: report.cause === 'interception',
        attacking: report.side === 'attacker',
        won: report.won,
        mine: report.mine,
        theirs: report.theirs,
        outpostDisabled: report.outpostDisabled,
      }),
      /** Surface 4.7 will hang the visual replay off the account; until it exists, the entry
       *  says what happened and offers nothing to open. */
      replay: null,
      remaining: null,
      resolutionAt: null,
    }));
}

const severityOf = (report: CombatReport): JournalDispatch['severity'] =>
  !report.won || report.mine.destroyed > 0 ? 'critical' : 'notable';

/** A player answers with his nation, or with his nickname when he never picked one — the server
 *  falls back to the nickname, and printing an internal key would be worse than either. */
export const nationName = (nation: string): string =>
  isNation(nation) ? fr.nations[nation] : nation;
