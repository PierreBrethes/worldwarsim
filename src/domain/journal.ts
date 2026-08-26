import { asLocalTime } from './duration';
import { cardinalLabel, countryLabel, fr } from '../i18n/fr';
import { isNation } from './nations';
import type {
  CombatReport,
  DispatchSeverity,
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
 *
 * **Two streams, one list.** Engagements are the source of everything a battle says; notices are
 * the source of everything else that happened while the player was away. They are merged **by
 * hour**, newest first, and nothing is derived from the board — a journal recomputed from the
 * current state would answer "what is true now", which is not the question the screen asks.
 *
 * `readAt` is the hour the player last closed the window, `null` while he never has. It decides
 * `unread` and nothing else: there is no per-dispatch flag to keep in step with a list rebuilt
 * on every load.
 */
export function journalDispatches(
  reports: ReadonlyArray<CombatReport>,
  reduction: ReductionBoard | null,
  entries: ReadonlyArray<WarEntry>,
  notices: ReadonlyArray<Notice> = [],
  readAt: number | null = null,
): ReadonlyArray<JournalDispatch> {
  const concluded: ReadonlyArray<Written> =
    reduction === null || reduction.concludedAt === null || reduction.winnerNation === null
      ? []
      : [
          {
            at: reduction.concludedAt,
            severity: 'critical',
            text: fr.victory.concluded(nationName(reduction.winnerNation)),
          },
        ];

  /**
   * **"X a réduit Y", named and read by everyone.** The test victory is public where design
   * sheet 05 keeps a doctrine secret, and that is the whole intent (`domain/victory.ts`): a
   * skirmish between friends wants the ribbing, and a secret with nothing behind it protects
   * nothing.
   */
  const reductions: ReadonlyArray<Written> = reports.flatMap((report) =>
    report.reduced === null
      ? []
      : [
          {
            at: report.at,
            severity: 'critical' as const,
            text: fr.victory.dispatch(
              nationName(report.reduced.by),
              nationName(report.reduced.whom),
            ),
          },
        ],
  );

  /**
   * **One more nation walks into the war** — a headline, and critical like everything else that
   * changes the table: this is the only announcement a player ever gets of it, and it carries
   * the hour because a late entry is read by the hour it happened.
   */
  const arrivals: ReadonlyArray<Written> = entries.map((entry) => ({
    at: entry.at,
    severity: 'critical' as const,
    text: fr.journal.warEntry(entry.nickname, nationName(entry.nation)),
  }));

  const filed: ReadonlyArray<Written> = notices.map(written);

  const all = [...concluded, ...reductions, ...arrivals, ...filed, ...reports.map(fromCombat)];

  return all
    .sort((a, b) => b.at - a.at)
    .map((entry) => ({
      at: entry.at,
      t: asLocalTime(entry.at),
      severity: entry.severity,
      text: entry.text,
      unread: readAt === null || entry.at > readAt,
      remaining: entry.remaining ?? null,
      resolutionAt: entry.resolutionAt ?? null,
    }));
}

/** A dispatch before it is dated and read: the hour stays a number until the very last step,
 *  because that is what the merge and the unread count both need. */
type Written = {
  readonly at: number;
  readonly severity: DispatchSeverity;
  readonly text: string;
  readonly remaining?: string | null;
  readonly resolutionAt?: string | null;
};

/**
 * **One sentence per kind, and the kind decides how loud it is.** Nothing here reads a board:
 * a notice already carries everything its sentence needs, which is what lets the journal be
 * *what happened* rather than *what is true now*.
 */
function written(notice: Notice): Written {
  const said = fr.journal.notices;
  switch (notice.kind) {
    /** A chantier the world took back: an entry of the queue is accepted against the state at
     *  the enqueue, and the right can be gone by the time its turn comes. Notable rather than
     *  critical — nothing was lost but the turn, and the matter is back in the reserve. */
    case 'constructionCancelled':
      return {
        at: notice.at,
        severity: 'notable',
        text: fr.journal.constructionCancelled(fr.buildings[notice.building], notice.regionName),
      };
    case 'constructionFinished':
      return {
        at: notice.at,
        severity: 'routine',
        text: said.constructionFinished(
          fr.buildings[notice.building],
          notice.regionName,
          notice.level,
        ),
      };
    case 'recruitmentDelivered':
      return {
        at: notice.at,
        severity: 'routine',
        text:
          notice.site === null
            ? said.deliveredHome(fr.roles[notice.role].one)
            : said.delivered(
                fr.buildings[notice.site.building],
                notice.site.regionName,
                fr.roles[notice.role].one,
              ),
      };
    case 'columnArrived':
      return {
        at: notice.at,
        severity: 'notable',
        text: said.columnArrived(
          notice.movementType,
          notice.troops,
          countryLabel(notice.hostCountry),
        ),
      };
    /** The one dispatch that carries an hour in the future — it is the whole of the journal's
     *  "au réveil" column (fiche 11 §4.1), and the column reads `resolutionAt`, not the text. */
    case 'movementStalled':
      return {
        at: notice.at,
        severity: 'notable',
        text: said.movementStalled(countryLabel(notice.hostCountry)),
        resolutionAt: asLocalTime(notice.resolvesAt),
      };
    case 'outpostFounded':
      return {
        at: notice.at,
        severity: 'notable',
        text: said.outpostFounded(
          fr.specializations[notice.specialization],
          countryLabel(notice.hostCountry),
        ),
      };
    /** **Désactivé, jamais pris** (ADR 0004) — critical, because it is the one thing on the board
     *  that stops paying without the player having done anything. */
    case 'outpostDisabled':
      return {
        at: notice.at,
        severity: 'critical',
        text: said.outpostDisabled(
          fr.specializations[notice.specialization],
          countryLabel(notice.hostCountry),
        ),
      };
    /**
     * **La dépêche nomme le détecteur, jamais la colonne.** C'est un fait du plateau de celui
     * qui lit — il sait ce qu'il a bâti — et c'est ce qui sépare « on a vu quelque chose » de
     * « ma station de Prahova l'a vu ». Rien de ce que le brouillard cache n'y entre : ni type,
     * ni composition, ni nation (fiche 04).
     */
    case 'movementSighted': {
      const country = countryLabel(notice.hostCountry);
      const cardinal = cardinalLabel(notice.headingDegrees);
      return {
        at: notice.at,
        severity: 'notable',
        text:
          notice.detector === 'territory'
            ? said.soilCrossed(country, cardinal)
            : notice.detector === 'station' && notice.detectorRegion !== null
              ? said.stationSighted(notice.detectorRegion, country, cardinal)
              : said.movementSighted(fr.detectors[notice.detector], country, cardinal),
      };
    }
    case 'firedDry':
      return {
        at: notice.at,
        severity: 'critical',
        text: said.firedDry(countryLabel(notice.hostCountry)),
      };
    /**
     * **Le leurre éventé et la colonne bredouille sont la même passe, lue des deux côtés.** L'un
     * apprend que ce qu'il guettait ne portait personne, l'autre que sa feinte est lue ; ni l'un
     * ni l'autre n'a livré bataille, et rien d'autre sur le plateau ne le dirait.
     */
    case 'decoyExposed':
      return {
        at: notice.at,
        severity: 'notable',
        text: said.decoyExposed(countryLabel(notice.hostCountry)),
      };
    case 'decoyBlown':
      return {
        at: notice.at,
        severity: 'notable',
        text: said.decoyBlown(countryLabel(notice.hostCountry)),
      };
    case 'decoyArrived':
      return {
        at: notice.at,
        severity: 'routine',
        text: said.decoyArrived(countryLabel(notice.hostCountry)),
      };
    case 'columnFoundNothing':
      return {
        at: notice.at,
        severity: 'notable',
        text: said.columnFoundNothing(
          notice.movementType,
          notice.troops,
          countryLabel(notice.hostCountry),
        ),
      };
  }
}

const fromCombat = (report: CombatReport): Written => ({
  at: report.at,
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
});

const severityOf = (report: CombatReport): DispatchSeverity =>
  !report.won || report.mine.destroyed > 0 ? 'critical' : 'notable';

/** A player answers with his nation, or with his nickname when he never picked one — the server
 *  falls back to the nickname, and printing an internal key would be worse than either. */
export const nationName = (nation: string): string =>
  isNation(nation) ? fr.nations[nation] : nation;
