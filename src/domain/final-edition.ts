import type { VerdictReason } from './blitz';
import { rankedByTerritory } from './standings';
import { raceLeaderOf, type StrategicPointKey } from './strategic-points';

/**
 * **L'édition finale d'une Mondiale, figée** (#443) : ce que la page de fin affiche, calculé une
 * fois à la conclusion et gardé après la saison. Rien n'est une phrase : chaque fait porte sa
 * sorte, son heure, ses nations, sa région et ses effectifs, et le client compose le français.
 * Une nation se nomme par sa clé (`germany`) ; les garnisons irrégulières par `null` dans une
 * passe et par `IRREGULAR` sur la carte.
 */

export const IRREGULAR = 'irregular';

/** Les moments de la saison, au plus. */
const MOMENTS_MAX = 9;

type Figures = {
  readonly territory: number;
  readonly general: number;
  readonly industry: number;
  readonly military: number;
  readonly deeds: number;
};

/** Une passe de résolution réduite à ce que l'édition en dit. `null` : les irréguliers. */
export type FinalPass = {
  readonly at: number;
  readonly regionId: string | null;
  readonly attacker: string | null;
  readonly defender: string | null;
  readonly winner: 'attacker' | 'defender';
  /** Les pièces des deux camps ; perdues = détruites, jamais mises en déroute. */
  readonly engaged: number;
  readonly attackerLost: number;
  readonly defenderLost: number;
};

/** Ce que les passes d'une saison laissent, pliées une à une : la base les rend page par page. */
export type PassTally = {
  readonly pieces: Readonly<Record<string, { readonly destroyed: number; readonly lost: number }>>;
  readonly firstContact: FinalPass | null;
  readonly biggest: FinalPass | null;
  readonly worst: Readonly<Record<string, FinalPass>>;
  readonly finest: Readonly<Record<string, FinalPass>>;
};

export const EMPTY_TALLY: PassTally = {
  pieces: {},
  firstContact: null,
  biggest: null,
  worst: {},
  finest: {},
};

const lostOn = (pass: FinalPass, nation: string) =>
  pass.attacker === nation ? pass.attackerLost : pass.defenderLost;
const destroyedOn = (pass: FinalPass, nation: string) =>
  pass.attacker === nation ? pass.defenderLost : pass.attackerLost;

/** Le plus grand l'emporte, puis le plus tôt : l'ordre des pages ne change pas la réponse. */
const outranks = (
  score: (pass: FinalPass) => number,
  pass: FinalPass,
  kept: FinalPass | null | undefined,
) =>
  kept === null ||
  kept === undefined ||
  score(pass) > score(kept) ||
  (score(pass) === score(kept) && pass.at < kept.at);

export function tallyPass(tally: PassTally, pass: FinalPass): PassTally {
  const pieces = { ...tally.pieces };
  const worst = { ...tally.worst };
  const finest = { ...tally.finest };
  for (const side of ['attacker', 'defender'] as const) {
    const nation = pass[side];
    if (nation === null) continue;
    const kept = pieces[nation] ?? { destroyed: 0, lost: 0 };
    pieces[nation] = {
      destroyed: kept.destroyed + destroyedOn(pass, nation),
      lost: kept.lost + lostOn(pass, nation),
    };
    const lost = (one: FinalPass) => lostOn(one, nation);
    if (lost(pass) > 0 && outranks(lost, pass, worst[nation])) worst[nation] = pass;
    /** Les garnisons irrégulières ne sont pas un adversaire (décision du 04/11). */
    const opponent = pass[side === 'attacker' ? 'defender' : 'attacker'];
    const destroyed = (one: FinalPass) => destroyedOn(one, nation);
    if (pass.winner === side && opponent !== null && outranks(destroyed, pass, finest[nation]))
      finest[nation] = pass;
  }
  const between = pass.attacker !== null && pass.defender !== null;
  return {
    pieces,
    worst,
    finest,
    firstContact:
      between && outranks((one) => -one.at, pass, tally.firstContact) ? pass : tally.firstContact,
    biggest: between && outranks((one) => one.engaged, pass, tally.biggest) ? pass : tally.biggest,
  };
}

/** Qui a tenu un des Sept, et depuis quand : `null` est un retour au neutre. */
export type Hand = { readonly at: number; readonly nation: string | null };

/**
 * **L'entrée dans la course, rejouée sur les mains des Sept** : chaque fois qu'une nation passe
 * à quatre points tenus (`raceLeaderOf`), comme `tallyRace` la constate au serveur. Un défait a
 * déjà rendu ses points au neutre (`leaveTheWar`), donc la main suffit.
 */
export function raceEntriesOf(
  points: ReadonlyArray<{
    readonly key: string;
    readonly regionId: string;
    readonly hands: ReadonlyArray<Hand>;
  }>,
): ReadonlyArray<{ at: number; nation: string; key: string; regionId: string }> {
  const events = points
    .flatMap((point) =>
      point.hands.map((hand) => ({ ...hand, key: point.key, regionId: point.regionId })),
    )
    .sort((left, right) => left.at - right.at);
  const holders = new Map<string, string | null>();
  const entries = [];
  let leader: string | null = null;
  for (const event of events) {
    holders.set(event.key, event.nation);
    const counts = new Map<string, number>();
    for (const holder of holders.values())
      if (holder !== null) counts.set(holder, (counts.get(holder) ?? 0) + 1);
    const now = raceLeaderOf(counts);
    if (now !== null && now !== leader)
      entries.push({ at: event.at, nation: now, key: event.key, regionId: event.regionId });
    leader = now;
  }
  return entries;
}

type Forces = {
  readonly engaged: number;
  readonly attackerLost: number;
  readonly defenderLost: number;
  readonly winner: 'attacker' | 'defender';
};

/** **Un fait de la saison**, moment ou plus beau coup. `nations` : l'acteur d'abord. */
export type Feat =
  | {
      readonly kind: 'contact' | 'battle' | 'pass';
      readonly at: number;
      readonly regionId: string | null;
      /** L'attaquant, puis le défenseur. */
      readonly nations: string[];
      readonly forces: Forces;
    }
  | {
      readonly kind: 'hqTaken';
      readonly at: number;
      readonly regionId: string | null;
      /** Le capteur, puis la nation tombée. */
      readonly nations: string[];
    }
  | {
      readonly kind: 'pointTaken' | 'race';
      readonly at: number;
      readonly regionId: string;
      readonly key: StrategicPointKey;
      /** Le preneur, puis celui à qui il le prend s'il n'était pas neutre. */
      readonly nations: string[];
    }
  | {
      readonly kind: 'verdict';
      readonly at: number;
      readonly regionId: null;
      /** Le vainqueur, absent à égalité ou à une clôture à la main. */
      readonly nations: string[];
    };

const passFeat = (kind: 'contact' | 'battle' | 'pass', pass: FinalPass): Feat => ({
  kind,
  at: pass.at,
  regionId: pass.regionId,
  nations: [pass.attacker, pass.defender].filter((nation): nation is string => nation !== null),
  forces: {
    engaged: pass.engaged,
    attackerLost: pass.attackerLost,
    defenderLost: pass.defenderLost,
    winner: pass.winner,
  },
});

type FinalVerdict = {
  readonly reason: VerdictReason;
  readonly winnerNation: string | null;
  readonly perMinute?: number;
  /** La nation qui a clos à la main. */
  readonly closedBy?: string;
};

type Exit = { readonly kind: 'eliminated' | 'surrendered'; readonly at: number | null };

type SeriesPoint = Figures & { readonly at: number };

export type FinalEditionInput = {
  readonly concludedAt: number;
  readonly verdict: FinalVerdict;
  /** Dans l'ordre de l'édition finale : le rang en sort, le territoire départagé par lui. */
  readonly nations: ReadonlyArray<{
    readonly nation: string;
    readonly nickname: string;
    readonly final: Figures;
    readonly series: ReadonlyArray<SeriesPoint>;
    readonly exit: Exit | null;
    /** Son QG tombé : l'heure de sa chute, où, et le capteur. */
    readonly hqLost: {
      readonly at: number;
      readonly regionId: string | null;
      readonly by: string | null;
    } | null;
    readonly outpostsCaptured: number;
    readonly outpostsLost: number;
    readonly dispatches: number;
    readonly pointHeldMs: number;
  }>;
  readonly points: ReadonlyArray<{
    readonly key: StrategicPointKey;
    readonly regionId: string;
    readonly hands: ReadonlyArray<Hand>;
    readonly heldMs: ReadonlyArray<{ readonly nation: string; readonly ms: number }>;
  }>;
  readonly tally: PassTally;
};

/** La même passe, même après un passage par le réseau, où elle n'est plus le même objet. */
const samePass = (left: FinalPass, right: FinalPass | null) =>
  right !== null && JSON.stringify(left) === JSON.stringify(right);

export function finalEditionOf(input: FinalEditionInput) {
  const { tally, points } = input;

  const hqTakes = input.nations
    .flatMap(({ nation, hqLost }) =>
      hqLost === null
        ? []
        : [
            {
              kind: 'hqTaken' as const,
              at: hqLost.at,
              regionId: hqLost.regionId,
              nations: hqLost.by === null ? [nation] : [hqLost.by, nation],
            },
          ],
    )
    .sort((left, right) => left.at - right.at);

  const takes = points
    .flatMap((point) =>
      point.hands.map((hand, rank) => ({
        key: point.key,
        regionId: point.regionId,
        at: hand.at,
        to: hand.nation,
        from: rank === 0 ? null : point.hands[rank - 1]!.nation,
      })),
    )
    .sort((left, right) => left.at - right.at);

  const race = raceEntriesOf(points).map(({ at, nation, key, regionId }): Feat => ({
    kind: 'race',
    at,
    regionId,
    key: key as StrategicPointKey,
    nations: [nation],
  }));

  const winner = input.verdict.winnerNation;
  /** La règle fixe des moments (05/11) : le verdict, le premier contact, la plus grande passe,
   *  les QG pris, les entrées dans la course — dans cet ordre jusqu'à neuf, puis à l'heure. */
  const moments: Feat[] = [
    {
      kind: 'verdict' as const,
      at: input.concludedAt,
      regionId: null,
      nations: winner === null ? [] : [winner],
    },
    ...(tally.firstContact === null ? [] : [passFeat('contact', tally.firstContact)]),
    ...(tally.biggest === null || samePass(tally.biggest, tally.firstContact)
      ? []
      : [passFeat('battle', tally.biggest)]),
    ...hqTakes,
    ...race,
  ]
    .slice(0, MOMENTS_MAX)
    .sort(
      (left, right) =>
        left.at - right.at || Number(left.kind === 'verdict') - Number(right.kind === 'verdict'),
    );

  const nations = rankedByTerritory(
    input.nations.map((line) => ({ ...line, territory: line.final.territory })),
  ).map((line) => {
    const { nation } = line;
    const pieces = tally.pieces[nation] ?? { destroyed: 0, lost: 0 };
    const taken = takes.filter((take) => take.to === nation);
    const hqTaken = hqTakes.find((take) => take.nations[0] === nation && take.nations.length === 2);
    const pointTaken = taken[0];
    const finestPass = tally.finest[nation];
    const finest: Feat | null =
      hqTaken !== undefined
        ? hqTaken
        : pointTaken !== undefined
          ? {
              kind: 'pointTaken',
              at: pointTaken.at,
              regionId: pointTaken.regionId,
              key: pointTaken.key,
              nations: pointTaken.from === null ? [nation] : [nation, pointTaken.from],
            }
          : finestPass !== undefined
            ? passFeat('pass', finestPass)
            : null;
    return {
      nation,
      nickname: line.nickname,
      rank: line.rank,
      figures: {
        ...line.final,
        destroyed: pieces.destroyed,
        lost: pieces.lost,
        pointHeldMs: line.pointHeldMs,
        dispatches: line.dispatches,
      },
      exit: line.exit,
      gains: {
        points: taken.map(({ key, at, from }) => ({ key, at, from })),
        hqs: hqTakes
          .filter((take) => take.nations[0] === nation && take.nations.length === 2)
          .map((take) => ({ at: take.at, regionId: take.regionId, nation: take.nations[1]! })),
        outposts: line.outpostsCaptured,
      },
      losses: {
        points: takes
          .filter((take) => take.from === nation)
          .map(({ key, at, to }) => ({ key, at, to })),
        hq: line.hqLost,
        outposts: line.outpostsLost,
        worstPass: tally.worst[nation] ?? null,
      },
      finest,
      series: [...line.series],
    };
  });

  return {
    verdict: input.verdict,
    nations,
    points: points.map((point) => ({
      ...point,
      hands: [...point.hands],
      heldMs: [...point.heldMs],
    })),
    moments,
  };
}
