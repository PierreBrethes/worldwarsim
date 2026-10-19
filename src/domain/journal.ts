import { isHqSite } from './capture';
import { asClockTime, asLocalTime } from './duration';
import { cardinalLabel, countryLabel, fr, ofName, theBuilding } from '../i18n/fr';
import { isNation } from './nations';
import { canonicalBuildingKey, isOutpostWork, RESOURCES } from './ids';
import { isPlunderTarget } from './movement-orders';
import { FIRST_SEVEN } from './strategic-points';
import type { BuildingKey } from './ids';
import type { ResourceAmounts } from './loot';
import { SUPPLY_KEYS, type SupplyLoad } from './logistics';
import type {
  CombatReport,
  DispatchKind,
  DispatchSeverity,
  JournalDispatch,
  MapPlace,
  Notice,
  SeasonOutcome,
  SeasonVerdict,
} from './player-view';

/**
 * **Ce que la colonne bredouille peut encore faire de ce qu'elle a sous les yeux** (retours du
 * 11/09). La dépêche ne nomme une installation relevée que si un ordre l'atteint — et c'est la
 * même fonction que la rose et le serveur lisent (`isPlunderTarget`), jamais une seconde liste :
 * promettre « saboter » là où la rose refuserait serait exactement la faute que l'ADR 0015
 * interdit. Un entrepôt rend du butin, un producteur ne rend que son arrêt ; une caserne ou un
 * port ne rendent rien, et la dépêche se tait.
 */
const reachableSite = (
  key: BuildingKey | undefined,
): { readonly key: BuildingKey; readonly effect: 'loot' | 'sabotage' } | null =>
  key === undefined || !isPlunderTarget(key)
    ? null
    : {
        key,
        effect: canonicalBuildingKey(key) === 'warehouse' ? 'loot' : 'sabotage',
      };

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
  /** La fin de la saison, et son verdict quand il y en a un. */
  outcome: (SeasonOutcome & { readonly verdict?: SeasonVerdict | null }) | null,
  notices: ReadonlyArray<Notice> = [],
  readAt: number | null = null,
): ReadonlyArray<JournalDispatch> {
  const verdict = outcome?.verdict ?? null;
  const closing =
    verdict !== null
      ? fr.victory.verdictConcluded(
          verdict.reason,
          verdict.winnerNation === null ? null : nationName(verdict.winnerNation),
          verdict.perMinute,
        )
      : outcome === null || outcome.winnerNation === null
        ? null
        : fr.victory.concluded(nationName(outcome.winnerNation));
  const concluded: ReadonlyArray<Written> =
    outcome === null || outcome.concludedAt === null || closing === null
      ? []
      : [
          {
            at: outcome.concludedAt,
            severity: 'critical',
            kind: 'seasonConcluded',
            text: closing,
          },
        ];

  const filed: ReadonlyArray<Written> = notices.map((notice) => ({
    ...written(notice),
    place: notice.place ?? null,
  }));

  const all = [...concluded, ...filed, ...reports.map(fromCombat)];

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
      combat: entry.combat ?? null,
      place: entry.place ?? null,
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
  readonly combat?: CombatReport;
  readonly place?: MapPlace | null;
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
        text: fr.journal.constructionCancelled(
          isOutpostWork(notice.building) ? fr.garrison.raiseWork : fr.buildings[notice.building],
          notice.regionName,
          notice.reason,
        ),
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
    /** **Rasé sur ordre**, jamais subi : encre normale, et la ligne dit le niveau perdu — c'est
     *  l'acier que le classement ne comptera plus à la prochaine édition. */
    case 'buildingDemolished':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'construction',
        text: said.buildingDemolished(
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
    /** Le lever : ce que la fondation avait seulement commandé. Encre normale — c'est une
     *  nouvelle du joueur, à l'heure exacte où le sol prend sa couleur. */
    case 'outpostStands':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'outpostStands',
        text: said.outpostStands(
          fr.specializations[notice.specialization],
          countryLabel(notice.hostCountry),
        ),
      };
    /** Encre rouge : un chantier perdu est de l'acier dépensé qui ne rend rien, et rien
     *  d'autre sur le plateau ne le dira. */
    case 'foundationLost':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'foundationLost',
        text: said.foundationLost(
          fr.specializations[notice.specialization],
          countryLabel(notice.hostCountry),
        ),
      };
    /** Encre normale : un point qui monte est une nouvelle du joueur, pas un événement qu'il
     *  subit — et personne d'autre ne la lit. */
    /** Encre critique : une cargaison perdue ne se répare pas, et rien d'autre dans le journal
     *  ne dit pourquoi ces compagnies ont disparu sans une passe qui les nomme. */
    case 'drownedAtSea':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'drownedAtSea',
        text: said.drownedAtSea(
          notice.men,
          notice.machines,
          fr.aim.pointAt(notice.point.lon, notice.point.lat),
        ),
      };
    case 'outpostRaised':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'outpostRaised',
        text: said.outpostRaised(
          notice.level,
          notice.regionName ?? countryLabel(notice.hostCountry),
        ),
      };
    /** **Le seul retrait qu'on s'inflige** : encre ordinaire, comme l'élévation. Rien n'a été
     *  subi, et un cachet d'alarme sur un geste volontaire se lirait comme une erreur. */
    case 'outpostDismantled':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'outpostDismantled',
        text: said.outpostDismantled(
          notice.level,
          countryLabel(notice.hostCountry),
          notice.buildings,
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
     * **Une alarme, au même titre qu'un avant-poste désactivé** (ADR 0020 §6) : le stock cesse de
     * monter sans que le joueur ait rien perdu ni rien fait, et rien d'autre sur le plateau ne
     * le dira. Le rétablissement, lui, est une nouvelle qu'on lit à son heure.
     */
    case 'productionCut':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'productionCut',
        text: said.productionCut(notice.sites, countryLabel(notice.hostCountry)),
      };
    case 'captureStarted':
    case 'captureSucceeded':
    case 'captureCancelled': {
      const site =
        notice.site.kind === 'building'
          ? `${theBuilding(canonicalBuildingKey(notice.site.building))} ${ofName(notice.regionName ?? '')}`.trim()
          : notice.site.kind === 'point'
            ? fr.points.site(notice.site.key)
            : fr.capture.outpostSite(notice.site.level, countryLabel(notice.site.hostCountry));
      const defending = notice.side === 'defender';
      if (notice.kind === 'captureStarted') {
        const until = asClockTime(notice.completesAt);
        return {
          at: notice.at,
          severity: defending ? 'critical' : 'notable',
          kind: defending ? 'captureThreat' : 'captureStarted',
          /** La chute d'un QG élimine (B10, M2a) : la dépêche le dit. */
          text: defending
            ? isHqSite(notice.site)
              ? said.hqThreat(site, until)
              : said.captureThreat(site, until)
            : said.captureStarted(site, until),
        };
      }
      if (notice.kind === 'captureSucceeded') {
        return {
          at: notice.at,
          severity: defending ? 'critical' : 'notable',
          kind: defending ? 'siteLost' : 'captured',
          text: defending ? said.siteLost(site) : said.captured(site),
        };
      }
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'captureCancelled',
        text: defending
          ? said.captureLifted(site)
          : notice.reason === 'gone'
            ? said.captureVoid(site)
            : said.captureAbandoned(site),
      };
    }
    case 'productionRestored':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'productionRestored',
        text: said.productionRestored(notice.sites, countryLabel(notice.hostCountry)),
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
    /** **Un camp, et rien de ce qu'il est** (ADR 0024 §1). La même règle qu'au-dessus, en plus
     *  pauvre encore : pas de cap, parce qu'un camp ne va nulle part. */
    case 'campSighted': {
      const country = countryLabel(notice.hostCountry);
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'campSighted',
        text:
          notice.detector === 'territory'
            ? said.campOnOurSoil(country)
            : notice.detector === 'station' && notice.detectorRegion !== null
              ? said.stationCampSighted(notice.detectorRegion, country)
              : said.campSighted(fr.detectors[notice.detector], country),
      };
    }
    case 'pursuitLost':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'foundNothing',
        text: said.pursuitLost(countryLabel(notice.hostCountry)),
      };
    case 'tourWaiting':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'supply',
        text: said.tourWaiting(
          fr.roles[notice.role].one,
          notice.why,
          notice.resource === undefined ? '' : fr.resources[notice.resource],
        ),
      };
    case 'tourEnded':
      return {
        at: notice.at,
        severity: notice.why === 'recalled' ? 'notable' : 'critical',
        kind: 'supply',
        text: said.tourEnded(fr.roles[notice.role].one, notice.why),
      };
    case 'supplyDelivered':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'supply',
        text: said.supplyDelivered(
          countryLabel(notice.hostCountry),
          supplyWords(notice.delivered),
          supplyWords(notice.kept),
        ),
      };
    case 'researchDone':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'research',
        text: said.researchDone(notice.card),
      };
    case 'airdropped':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'airdrop',
        text: said.airdropped(
          countryLabel(notice.hostCountry),
          supplyWords(notice.delivered),
          supplyWords(notice.kept),
          notice.squad === true,
        ),
      };
    case 'firedDry':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'firedDry',
        text: said.firedDry(countryLabel(notice.hostCountry), notice.troops ?? 1),
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
          reachableSite(notice.installation),
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
    case 'playerEliminated':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'elimination',
        text:
          notice.by === undefined
            ? said.playerEliminatedAside(nationName(notice.nation), notice.irregulars === true)
            : said.playerEliminated(
                nationName(notice.nation),
                nationName(notice.by),
                notice.irregulars === true,
              ),
      };
    /** Sobre, et pas critique : le titre a changé de main, la guerre n'a pas bougé. */
    case 'commandTransferred':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'command',
        text: said.commandTransferred(nationName(notice.nation)),
      };
    /** **La course aux Sept change de main** (P2) : la table entière le lit, et la victoire s'y
     *  joue — notable, jamais une alarme, qui est la capture qui s'ouvre contre soi. */
    case 'pointTaken':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'pointTaken',
        text: fr.points.taken(nationName(notice.nation), notice.key),
      };
    case 'pointsDrawn':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'pointTaken',
        text: fr.points.drawn(notice.keys ?? FIRST_SEVEN),
      };
    case 'depotBurned':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'depotBurned',
        text: fr.points.depotBurned(
          notice.side,
          countryLabel(notice.country),
          supplyWords(notice.lost) || fr.points.nothing,
        ),
      };
    case 'readAtIstanbul':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'pointTaken',
        text:
          notice.text === undefined
            ? fr.points.istanbul.overheard(nationName(notice.from), nationName(notice.to))
            : fr.points.istanbul.read(nationName(notice.from), nationName(notice.to), notice.text),
      };
    /**
     * **Le rendez-vous collectif, et il est routinier** : l'édition paraît à l'heure dite, elle
     * n'annonce rien qui exige un geste. Son rang seul y figure — la table se lit à la page de
     * presse, et la chiffrer ici en ferait une seconde source à tenir d'accord avec la première.
     */
    case 'editionPublished':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'edition',
        text: said.editionPublished(asLocalTime(notice.at), notice.rank),
      };
    case 'lootTaken':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'lootTaken',
        text: said.lootTaken(
          fr.buildings[notice.building],
          notice.regionName,
          lootWords(notice.loot),
        ),
      };
    case 'sitePlundered':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'sitePlundered',
        text: said.sitePlundered(
          fr.buildings[notice.building],
          notice.regionName,
          lootWords(notice.taken),
          lootWords(notice.storageLost),
        ),
      };
    case 'siteSabotaged':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'siteSabotaged',
        text: said.siteSabotaged(fr.buildings[notice.building], notice.regionName),
      };
    case 'expeditionFoundNothing':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'foundNothing',
        text: said.expeditionFoundNothing(
          fr.buildings[notice.building],
          notice.regionName,
          notice.reason,
        ),
      };
    case 'lootLost':
      return {
        at: notice.at,
        severity: 'critical',
        kind: 'lootLost',
        text: said.lootLost(lootWords(notice.loot)),
      };
    case 'lootRecovered':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'lootRecovered',
        text: said.lootRecovered(countryLabel(notice.hostCountry), lootWords(notice.loot)),
      };
    case 'lootCollected':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'lootCollected',
        text: said.lootCollected(countryLabel(notice.hostCountry), lootWords(notice.loot)),
      };
    case 'lootDelivered':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'lootDelivered',
        text: said.lootDelivered(
          notice.regionName,
          lootWords(notice.delivered),
          lootWords(notice.lost),
        ),
      };
    /**
     * **Les trois dépêches publiques du jeu, et les seules** : tout le monde les reçoit à la même
     * heure. La réserve signalée est *notable* — c'est une décision à prendre, pas une alarme —,
     * la paire sans réserve et la réserve vidée sont des nouvelles qu'on lit à son heure.
     *
     * **Aucune ne nomme personne** : ni la garnison qui tient l'objectif, ni la main qui l'a vidé.
     * La première est du brouillard, la seconde serait de l'information de position (ADR 0005).
     */
    case 'objectiveRevealed':
      return {
        at: notice.at,
        severity: 'notable',
        kind: 'objectiveRevealed',
        text: said.objectiveRevealed(
          fr.objectives.names[notice.objective] ?? notice.objective,
          notice.regionName,
          countryLabel(notice.hostCountry),
        ),
      };
    case 'objectiveTaken':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'objectiveTaken',
        text: said.objectiveTaken(
          fr.objectives.names[notice.objective] ?? notice.objective,
          countryLabel(notice.hostCountry),
        ),
      };
    case 'objectiveGap':
      return {
        at: notice.at,
        severity: 'routine',
        kind: 'objectiveGap',
        text: said.objectiveGap(notice.nations.map(nationName)),
      };
  }
}

/** **Ce qu'une charge dit d'elle-même**, en toutes lettres. Exportée parce que le mât d'un
 *  objectif neutre écrit son dépôt restant de la même façon : deux formats pour la même chose
 *  se seraient désaccordés au premier arrondi. */
export const lootWords = (loot: ResourceAmounts): string => {
  const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const entries = RESOURCES.filter((resource) => loot[resource] > 0).map(
    (resource) => `${number.format(loot[resource])} ${fr.resources[resource]}`,
  );
  return entries.length === 0 ? 'rien' : entries.join(' · ');
};

/** Une charge de munitions, pétrole et charbon en toutes lettres ; vide, rien. */
const supplyWords = (load: SupplyLoad): string =>
  SUPPLY_KEYS.filter((key) => load[key] > 0)
    .map((key) => `${load[key]} ${fr.resources[key]}`)
    .join(', ');

const fromCombat = (report: CombatReport): Written => ({
  at: report.at,
  severity: severityOf(report),
  /** **Une passe, deux nouvelles.** L'assaut mené est une décision qu'on a prise ; l'assaut subi
   *  est une chose qui vous est arrivée pendant que vous dormiez — seule la seconde est une
   *  alarme, et le tampon de la marge est le seul endroit qui les sépare d'un coup d'œil. */
  kind: report.side === 'defender' ? 'attacked' : 'assault',
  text: fr.combat.dispatch({
    where: countryLabel(report.hostCountry),
    cause: report.cause,
    attacking: report.side === 'attacker',
    won: report.won,
    mine: report.mine,
    theirs: report.theirs,
    outpostDisabled: report.outpostDisabled,
    shock: report.shock === true,
    faced: report.faced,
  }),
  combat: report,
  place: report.point,
});

const severityOf = (report: CombatReport): DispatchSeverity =>
  !report.won || report.mine.destroyed > 0 ? 'critical' : 'notable';

/** A player answers with his nation, or with his nickname when he never picked one — the server
 *  falls back to the nickname, and printing an internal key would be worse than either. */
const nationName = (nation: string): string => (isNation(nation) ? fr.nations[nation] : nation);

/**
 * **Ce qui prend l'encre rouge, et rien d'autre** (règle 3 du tampon, `shell/Stamp.tsx`). Quatre
 * sortes : ce qu'on a subi, ce qu'on a perdu, ce qui a manqué au moment de tirer, et ce qu'on a
 * vu passer. Elles ont en commun d'appeler une décision *maintenant* ; une livraison, un chantier
 * fini, un avant-poste fondé sont des nouvelles qu'on lit à son heure.
 *
 * `seasonConcluded` n'y est pas, et c'est délibéré : une saison close n'exige plus rien de
 * personne — elle se relit, elle ne se joue plus. `productionRestored` non plus, pour la raison
 * inverse : c'est une nouvelle qu'on lit à son heure.
 */
const ALARMS: ReadonlyArray<DispatchKind> = [
  'attacked',
  'outpostDisabled',
  'firedDry',
  'sighting',
  'productionCut',
  'captureThreat',
  'siteLost',
  'sitePlundered',
  'lootLost',
  /** Une cargaison coulée est une perte sèche, et la seule que la passe ne raconte pas. */
  'drownedAtSea',
];

export const isAlarm = (kind: DispatchKind): boolean => ALARMS.includes(kind);

/**
 * **Les combats arrivés depuis `seenAt`, et eux seuls** — ce que le toast de la carte annonce. Le
 * journal servi à l'ouverture est déjà là quand on regarde : il se lit au journal, pas en toast
 * (même silence au chargement que `inkBursts`).
 */
export const combatsSince = (
  journal: ReadonlyArray<JournalDispatch>,
  seenAt: number,
): ReadonlyArray<JournalDispatch> =>
  journal.filter((dispatch) => dispatch.combat !== null && dispatch.at > seenAt);

export const latestDispatchAt = (journal: ReadonlyArray<JournalDispatch>): number =>
  Math.max(0, ...journal.map((dispatch) => dispatch.at));
