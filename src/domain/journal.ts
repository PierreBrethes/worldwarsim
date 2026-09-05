import { asLocalTime } from './duration';
import { cardinalLabel, countryLabel, fr } from '../i18n/fr';
import { isNation } from './nations';
import type {
  CombatReport,
  DispatchKind,
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
            kind: 'seasonConcluded',
            text: fr.victory.concluded(nationName(reduction.winnerNation)),
          },
        ];

  /**
   * **"X a réduit Y", named and read by everyone.** The test victory is public on purpose
   * (`domain/victory.ts`): the condition is unique, so it is read out loud, and a skirmish
   * between friends wants the ribbing.
   */
  const reductions: ReadonlyArray<Written> = reports.flatMap((report) =>
    report.reduced === null
      ? []
      : [
          {
            at: report.at,
            severity: 'critical' as const,
            kind: 'reduction' as const,
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
    kind: 'warEntry' as const,
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
      kind: entry.kind,
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
  readonly kind: DispatchKind;
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
        kind: 'construction',
        text: fr.journal.constructionCancelled(fr.buildings[notice.building], notice.regionName),
      };
    case 'constructionFinished':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'construction',
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
        kind: 'delivery',
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
        kind: 'column',
        text: said.columnArrived(
          notice.movementType,
          notice.troops,
          countryLabel(notice.hostCountry),
        ),
      };
    case 'garrisonEntered':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'column',
        text: said.garrisonEntered(notice.troops, fr.buildings[notice.building], notice.regionName),
      };
    /** The one dispatch that carries an hour in the future — it is the whole of the journal's
     *  "au réveil" column (fiche 11 §4.1), and the column reads `resolutionAt`, not the text. */
    case 'movementStalled':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'stalled',
        text: said.movementStalled(countryLabel(notice.hostCountry)),
        resolutionAt: asLocalTime(notice.resolvesAt),
      };
    case 'outpostFounded':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'outpostFounded',
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
        kind: 'outpostDisabled',
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
        kind: 'sighting',
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
        kind: 'firedDry',
        text: said.firedDry(countryLabel(notice.hostCountry)),
      };
    /**
     * **La seule passe qui n'en est pas une** : une colonne qui marche sur un sol vide ne dépose
     * ni engagement ni butin, et sans cette ligne le joueur lisait « rien à signaler » après la
     * plus longue marche de sa saison. Elle est née avec le leurre, qui en était l'autre face ;
     * le leurre est parti le 29/08/2026 et elle reste, parce qu'elle n'a jamais été à lui.
     */
    case 'columnFoundNothing':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'foundNothing',
        text: said.columnFoundNothing(
          notice.movementType,
          notice.troops,
          countryLabel(notice.hostCountry),
        ),
      };
    /** **Une fin sans vainqueur.** Elle partage la sorte de la victoire de test — c'est la même
     *  nouvelle, la saison est close — mais elle ne nomme personne, parce que personne n'a
     *  gagné : le fondateur a rangé la partie. */
    case 'seasonClosed':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'seasonConcluded',
        text: said.seasonClosed,
      };
    /**
     * **Une capitulation se lit comme une entrée en guerre, par l'autre bout** : c'est l'autre
     * moitié de la table qui bouge, et le journal est le seul canal qui l'annonce. Critique pour
     * la même raison — un belligérant de moins change ce que valent tous les autres.
     */
    case 'playerSurrendered':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'surrender',
        text: said.playerSurrendered(nationName(notice.nation)),
      };
    /** Sobre, et pas critique : le titre a changé de main, la guerre n'a pas bougé. */
    case 'commandTransferred':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'command',
        text: said.commandTransferred(nationName(notice.nation)),
      };
  }
}

const fromCombat = (report: CombatReport): Written => ({
  at: report.at,
  severity: severityOf(report),
  /** **Une passe, deux nouvelles.** L'assaut mené est une décision qu'on a prise ; l'assaut subi
   *  est une chose qui vous est arrivée pendant que vous dormiez — seule la seconde est une
   *  alarme, et le tampon de la marge est le seul endroit qui les sépare d'un coup d'œil. */
  kind: report.side === 'defender' ? 'attacked' : 'assault',
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

/**
 * **Ce qui prend l'encre rouge, et rien d'autre** (règle 3 du tampon, `shell/Stamp.tsx`). Quatre
 * sortes : ce qu'on a subi, ce qu'on a perdu, ce qui a manqué au moment de tirer, et ce qu'on a
 * vu passer. Elles ont en commun d'appeler une décision *maintenant* ; une livraison, un chantier
 * fini, un avant-poste fondé sont des nouvelles qu'on lit à son heure.
 *
 * `seasonConcluded` n'y est pas, et c'est délibéré : une saison close n'exige plus rien de
 * personne — elle se relit, elle ne se joue plus.
 */
const ALARMS: ReadonlyArray<DispatchKind> = ['attacked', 'outpostDisabled', 'firedDry', 'sighting'];

export const isAlarm = (kind: DispatchKind): boolean => ALARMS.includes(kind);
