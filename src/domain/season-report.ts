/**
 * **Le rapport de fin de saison Mondiale** (ADR 0027 §7) : l'instrument d'équilibrage qui remplace
 * le simulateur. Il mesure les cinq cas de casse du §5 (boule de neige, tortue, tapis
 * d'avant-postes, escouade monstre, charge), l'isolement des États-Unis et les élévations face
 * aux fondations.
 *
 * **Une fonction pure sur des faits déjà lus** : la lecture de la base (`convex/seasonReport.ts`)
 * ne fait que ranger, le calcul vit ici. Ce que la base ne garde pas est dit par le rapport, pas
 * inventé : seuls les éditions (`editions`) et les dépêches (`notices`) forment une série dans le
 * temps ; les troupes, leur place et les escouades n'existent qu'à l'instant de la lecture.
 */

const HOUR_MS = 3_600_000;

type ReportPlayer = {
  readonly id: string;
  readonly nation: string | null;
  readonly nickname: string;
  /** Le siège des garnisons neutres : il n'est pas un joueur. */
  readonly irregular?: boolean;
};

/** Une ligne d'édition (`editions`) : les chiffres de classement d'un joueur à une heure. */
type ReportEdition = {
  readonly playerId: string;
  readonly at: number;
  readonly territory: number;
  readonly industry: number;
  readonly military: number;
};

/** `place` est l'adresse de la troupe, ou la colonne qui la porte : même place, même escouade. */
export type ReportTroop = {
  readonly playerId: string;
  readonly place: string;
  readonly where: 'home' | 'abroad' | 'marching';
};

/**
 * Un fait d'avant-poste tiré du journal : `stands` (un chantier est devenu un point), `raised`
 * (une élévation), `dismantled`, `captured` (il a pris celui d'un autre), `taken` (on lui a pris
 * le sien), `lost` (un chantier mort avant d'être debout, il ne comptait pas encore).
 */
export type OutpostEvent = {
  readonly playerId: string;
  readonly at: number;
  readonly kind: 'stands' | 'raised' | 'dismantled' | 'captured' | 'taken' | 'lost';
};

type ReportEngagement = {
  readonly attackerId: string;
  readonly defenderId: string;
  readonly at: number;
};

export type ReportInput = {
  readonly launchedAt: number;
  /** L'heure de la lecture : la clôture d'une saison conclue, sinon maintenant. */
  readonly now: number;
  readonly stepHours: number;
  /** `MONDIALE_TROOP_BOUND`, passée par l'appelant : le domaine n'importe aucune constante. */
  readonly bound: number;
  readonly players: ReadonlyArray<ReportPlayer>;
  readonly editions: ReadonlyArray<ReportEdition>;
  readonly troops: ReadonlyArray<ReportTroop>;
  /** Troupes en file de recrutement, par joueur. */
  readonly queued: Readonly<Record<string, number>>;
  readonly outposts: ReadonlyArray<OutpostEvent>;
  readonly engagements: ReadonlyArray<ReportEngagement>;
};

type SnowballRow = {
  readonly hour: number;
  /** L'heure de l'édition lue à cette marque : si les éditions s'arrêtent, elle ne suit plus. */
  readonly edition: number;
  readonly leaderId: string;
  /** Le plus riche contre le deuxième, en `general` ; `null` s'il n'a pas de second. */
  readonly lead: number | null;
  /** Parts du plus riche dans le total des joueurs, en pour cent. */
  readonly army: number;
  readonly production: number;
  readonly territory: number;
};

/** **La tortue** : où se tiennent les troupes d'un joueur à l'instant de la lecture. */
type TroopRow = {
  readonly playerId: string;
  readonly total: number;
  readonly home: number;
  readonly abroad: number;
  readonly marching: number;
};

/** **L'escouade monstre** : la plus grosse, et où elle se tient. */
type SquadRow = {
  readonly playerId: string;
  readonly largest: number;
  readonly where: ReportTroop['where'] | null;
};

/** **La charge** : les pièces d'un joueur, file de recrutement comprise, face à la borne. */
type LoadRow = {
  readonly playerId: string;
  readonly pieces: number;
  readonly queued: number;
  readonly bound: number;
};

/**
 * **Le tapis d'avant-postes, et élever ou fonder** : points debout à chaque marque, le sommet
 * atteint entre deux marques, et les gestes comptés un à un (fondation, élévation, démantèlement,
 * prise et perte par capture, chantier mort).
 */
type OutpostRow = {
  readonly playerId: string;
  readonly series: ReadonlyArray<number>;
  readonly standing: number;
  readonly peak: number;
  readonly founded: number;
  readonly raised: number;
  readonly dismantled: number;
  readonly captured: number;
  readonly taken: number;
  readonly lost: number;
};

/**
 * **L'isolement** : les engagements d'une nation contre les autres nations, et l'heure du
 * premier contact. Les garnisons neutres sont comptées à part : les frapper n'est pas toucher
 * quelqu'un.
 */
type IsolationRow = {
  readonly nation: string;
  readonly given: number;
  readonly suffered: number;
  readonly vsNeutral: number;
  /** Heures depuis le lancement ; `null` si personne ne l'a jamais touchée ni n'a été touché. */
  readonly firstContact: number | null;
  /** Le total des engagements, donnés comme subis, contre chaque nation. */
  readonly against: Readonly<Record<string, number>>;
};

export type SeasonReport = {
  /** Heures depuis le lancement : chaque pas, puis l'heure de la lecture. */
  readonly marks: ReadonlyArray<number>;
  readonly snowball: ReadonlyArray<SnowballRow>;
  readonly troops: ReadonlyArray<TroopRow>;
  readonly squads: ReadonlyArray<SquadRow>;
  readonly load: ReadonlyArray<LoadRow>;
  readonly outposts: ReadonlyArray<OutpostRow>;
  readonly isolation: ReadonlyArray<IsolationRow>;
};

const sum = (values: ReadonlyArray<number>): number => values.reduce((a, b) => a + b, 0);
const percent = (part: number, total: number): number => (total <= 0 ? 0 : (part / total) * 100);

export function seasonReportOf(input: ReportInput): SeasonReport {
  const marks = marksOf(input);
  const players = input.players.filter((player) => player.irregular !== true);
  const troopsOf = (id: string) => input.troops.filter((troop) => troop.playerId === id);
  return {
    marks,
    snowball: snowballOf(input, marks),
    troops: players.map(({ id }) => {
      const mine = troopsOf(id);
      const count = (where: ReportTroop['where']) =>
        mine.filter((troop) => troop.where === where).length;
      return {
        playerId: id,
        total: mine.length,
        home: count('home'),
        abroad: count('abroad'),
        marching: count('marching'),
      };
    }),
    squads: players.map(({ id }) => squadOf(id, troopsOf(id))),
    load: players.map(({ id }) => ({
      playerId: id,
      pieces: troopsOf(id).length,
      queued: input.queued[id] ?? 0,
      bound: input.bound,
    })),
    outposts: players.map(({ id }) => outpostsOf(input, marks, id)),
    isolation: isolationOf(input, players),
  };
}

function isolationOf(
  input: ReportInput,
  players: ReadonlyArray<ReportPlayer>,
): ReadonlyArray<IsolationRow> {
  const seats = new Map(input.players.map((player) => [player.id, player]));
  const rows: IsolationRow[] = [];
  for (const { nation } of players) {
    if (nation === null) continue;
    let given = 0;
    let suffered = 0;
    let vsNeutral = 0;
    let first: number | null = null;
    const against: Record<string, number> = {};
    for (const engagement of input.engagements) {
      const attacker = seats.get(engagement.attackerId);
      const defender = seats.get(engagement.defenderId);
      const mine =
        attacker?.nation === nation ? 'given' : defender?.nation === nation ? 'suffered' : null;
      if (mine === null) continue;
      const other = mine === 'given' ? defender : attacker;
      if (other === undefined || other.irregular === true || other.nation === null) {
        vsNeutral += 1;
        continue;
      }
      if (mine === 'given') given += 1;
      else suffered += 1;
      against[other.nation] = (against[other.nation] ?? 0) + 1;
      first = first === null ? engagement.at : Math.min(first, engagement.at);
    }
    rows.push({
      nation,
      given,
      suffered,
      vsNeutral,
      firstContact: first === null ? null : (first - input.launchedAt) / HOUR_MS,
      against,
    });
  }
  return rows;
}

/** Ce que chaque fait change au nombre de points debout ; un chantier mort ne l'a jamais changé. */
const STANDING_DELTA: Readonly<Record<OutpostEvent['kind'], number>> = {
  stands: 1,
  captured: 1,
  dismantled: -1,
  taken: -1,
  raised: 0,
  lost: 0,
};

function outpostsOf(
  input: ReportInput,
  marks: ReadonlyArray<number>,
  playerId: string,
): OutpostRow {
  const events = input.outposts
    .filter((event) => event.playerId === playerId)
    .sort((a, b) => a.at - b.at);
  const count = (kind: OutpostEvent['kind']) =>
    events.filter((event) => event.kind === kind).length;
  let standing = 0;
  let peak = 0;
  for (const event of events) {
    standing += STANDING_DELTA[event.kind];
    peak = Math.max(peak, standing);
  }
  const standingAt = (hour: number) =>
    events
      .filter((event) => event.at <= input.launchedAt + hour * HOUR_MS)
      .reduce((total, event) => total + STANDING_DELTA[event.kind], 0);
  return {
    playerId,
    series: marks.map(standingAt),
    standing,
    peak,
    founded: count('stands'),
    raised: count('raised'),
    dismantled: count('dismantled'),
    captured: count('captured'),
    taken: count('taken'),
    lost: count('lost'),
  };
}

/** Une escouade, ce sont les troupes d'un joueur à la même place (ADR 0026, révision du 16/10). */
function squadOf(playerId: string, troops: ReadonlyArray<ReportTroop>): SquadRow {
  const squads = new Map<string, { size: number; where: ReportTroop['where'] }>();
  for (const troop of troops) {
    const squad = squads.get(troop.place) ?? { size: 0, where: troop.where };
    squads.set(troop.place, { ...squad, size: squad.size + 1 });
  }
  let biggest: { size: number; where: ReportTroop['where'] } | null = null;
  for (const squad of squads.values())
    if (biggest === null || squad.size > biggest.size) biggest = squad;
  return { playerId, largest: biggest?.size ?? 0, where: biggest?.where ?? null };
}

function marksOf({ launchedAt, now, stepHours }: ReportInput): ReadonlyArray<number> {
  const elapsed = (now - launchedAt) / HOUR_MS;
  const marks: number[] = [];
  for (let hour = stepHours; hour <= elapsed; hour += stepHours) marks.push(hour);
  if (marks[marks.length - 1] !== elapsed) marks.push(elapsed);
  return marks;
}

/** **La boule de neige** : à chaque marque, la dernière édition connue, et ce qu'y pèse le plus
 *  riche (`industry + military`, comme le classement général) face à tous les autres. */
function snowballOf(input: ReportInput, marks: ReadonlyArray<number>): ReadonlyArray<SnowballRow> {
  const byAt = new Map<number, ReportEdition[]>();
  for (const edition of input.editions) {
    byAt.set(edition.at, [...(byAt.get(edition.at) ?? []), edition]);
  }
  const hours = [...byAt.keys()].sort((a, b) => a - b);
  const rows: SnowballRow[] = [];
  for (const hour of marks) {
    const limit = input.launchedAt + hour * HOUR_MS;
    const at = hours.filter((candidate) => candidate <= limit).at(-1);
    if (at === undefined) continue;
    const lines = byAt.get(at) ?? [];
    const general = (line: ReportEdition) => line.industry + line.military;
    const ranked = [...lines].sort((a, b) => general(b) - general(a));
    const leader = ranked[0];
    if (leader === undefined) continue;
    const second = ranked[1];
    rows.push({
      hour,
      edition: (at - input.launchedAt) / HOUR_MS,
      leaderId: leader.playerId,
      lead: second === undefined || general(second) <= 0 ? null : general(leader) / general(second),
      army: percent(leader.military, sum(lines.map((line) => line.military))),
      production: percent(leader.industry, sum(lines.map((line) => line.industry))),
      territory: leader.territory,
    });
  }
  return rows;
}
