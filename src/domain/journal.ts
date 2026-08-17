import { asLocalTime } from './duration';
import { fr } from '../i18n/fr';
import { ADM0_BY_NATION, isNation } from './nations';
import type { CombatReport, JournalDispatch, ReductionBoard } from './player-view';

/**
 * **The journal is written here, from the account the server keeps** — never from a second
 * resolution of the pass. The server sends ids and numbers (ADR 0016); the French is put on them
 * at the last moment, which is also the only way "j'en perds 16, il en perd 22" ends up phrased
 * once instead of in every panel that shows a battle.
 */
export function combatDispatches(
  reports: ReadonlyArray<CombatReport>,
  reduction: ReductionBoard | null,
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

  return [...concluded, ...reductions, ...combatOnly(reports)];
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

/**
 * The host country travels as a Natural Earth `adm0_a3` — the key the regions are cut by. Only
 * the eight playable ones have a name in the game's vocabulary; anything else prints its code,
 * which is the honest thing to do until a code-to-name table is baked (the same gap the outpost
 * labels already live with).
 */
const NATION_BY_ADM0 = new Map(
  Object.entries(ADM0_BY_NATION).map(([nation, code]) => [code, nation]),
);

function countryLabel(adm0: string): string {
  const nation = NATION_BY_ADM0.get(adm0);
  return nation !== undefined && isNation(nation) ? fr.nations[nation] : adm0;
}

/** A player answers with his nation, or with his nickname when he never picked one — the server
 *  falls back to the nickname, and printing an internal key would be worse than either. */
export const nationName = (nation: string): string =>
  isNation(nation) ? fr.nations[nation] : nation;
