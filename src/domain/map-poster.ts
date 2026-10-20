import { pileSupplies, type PileSupplies } from './supplies';
import { CARRY_CAPACITY_BY_ROLE } from '../../convex/constants';
import { cardName, fr, stackLabel } from '@/i18n/fr';
import { researchProgressOf, searcherOf } from './research';
import { incomePerMinute } from './blitz';
import { riseOf, type WorkSite } from './construction';
import type { BuildingKey } from './ids';
import { capturingAt, isHqSite, progressAt } from './capture';
import { asClockTime, asDuration, reloadClock } from './duration';
import { YIELD_OF, produces } from './economy';
import { loadingUntilOf } from './loading';
import { carryCapacityOf } from './loot';
import type { MapLabel } from './labels';
import { pileSheet, type SheetLine } from './pile-pieces';
import type { CargoView, PlayerView, TroopView } from './player-view';
import { surveyedAt } from './survey-ink';
import { marchingTroopIds, stationKeyOf, troopsAt } from './troops';

type PosterLine =
  | { readonly kind: 'row'; readonly label: string; readonly value: string }
  | {
      readonly kind: 'chip';
      readonly label: string;
      readonly chip: string;
      readonly tone: 'ok' | 'cut';
    }
  | { readonly kind: 'text'; readonly text: string };

/**
 * **What the hovered piece says of itself** (table d'état-major) — the press card that stands
 * over it while the pointer does. Read off the label and the `PlayerView`, never more: an enemy
 * label has neither type nor stack, so its poster cannot print them by distraction.
 */
export type Poster = {
  readonly eyebrow: string;
  readonly title: string;
  /** Un relevé n'est pas su à l'instant : la carte se lit délavée. */
  readonly washed: boolean;
  readonly lines: ReadonlyArray<PosterLine>;
  readonly bar: number | null;
  /** My expedition loading on site: when its presence ends (`loadingUntilOf`), its bar crawls. */
  readonly loading: number | null;
  readonly pile: {
    readonly lines: ReadonlyArray<SheetLine>;
    readonly cargo: ReadonlyArray<CargoView>;
    /** What the pile can carry, empty or not; `null` (or absent, on the landing's table) where
     *  nothing is carried, as in Blitz. */
    readonly capacity?: number | null;
  } | null;
  /** **Coups et plein** de ma pile (ADR 0028 §3), absents en Blitz et ailleurs. */
  readonly supplies?: PileSupplies | null;
};

const plain = { washed: false, lines: [], bar: null, loading: null, pile: null } as const;

/**
 * **Une capture se lit aussi à l'affiche** (14/10) : sur le site qu'elle vise, chez ses deux
 * camps, et sur la pile qui le tient chez le capteur — « 63 % · fin vers 14:20 ».
 */
export function posterOf(label: MapLabel, view: PlayerView, now: number): Poster | null {
  const capture = captureOn(label, view);
  const poster = pieceOf(label, view, now);
  if (capture === null) return poster;
  const percent = Math.floor(progressAt(capture.clock, now) * 100);
  const hour = asClockTime(capture.completesAt);
  const line: PosterLine = {
    kind: 'chip',
    label: fr.capture.stamp,
    chip:
      capture.side === 'capturer'
        ? fr.capture.endsAt(percent, hour)
        : fr.capture.lostAt(percent, hour, isHqSite(capture.site)),
    tone: capture.side === 'capturer' ? 'ok' : 'cut',
  };
  return poster === null
    ? { ...plain, eyebrow: fr.capture.stamp, title: natureOf(label), lines: [line] }
    : { ...poster, lines: [...poster.lines, line] };
}

function captureOn(label: MapLabel, view: PlayerView) {
  const line = label.lines.find((candidate) => candidate.role === 'capture');
  if (line !== undefined && line.role === 'capture') return line;
  const station = label.type === 'stack' ? label.station : null;
  if (station?.kind !== 'point') return null;
  return capturingAt(view.captures, station.lonLat) ?? null;
}

function pieceOf(label: MapLabel, view: PlayerView, now: number): Poster | null {
  if (label.type === 'stack' && label.station !== null) {
    const held = troopsAt(view.me, stationKeyOf(label.station), marchingTroopIds(view.arcs));
    if (held.length === 0) return null;
    const ids = new Set(held.map((troop) => troop.id));
    const mending = held.filter((troop) => troop.mending).length;
    return {
      ...plain,
      eyebrow: fr.troops.sheetKicker(
        held.length,
        held.some((troop) => troop.strength < troop.nominalStrength),
      ),
      title: natureOf(label),
      supplies: pileSupplies(held),
      lines: [
        ...waitingChips(held, now),
        ...(mending === 0
          ? []
          : [
              {
                kind: 'chip' as const,
                label: fr.blitz.mend,
                chip: fr.blitz.mending(mending),
                tone: 'ok' as const,
              },
            ]),
      ],
      pile: {
        lines: pileSheet(held),
        cargo: view.me.stationedCargo
          .filter((group) => group.troopIds.some((id) => ids.has(id)))
          .map((group) => group.cargo),
        capacity:
          view.mode === 'blitz' ? null : Math.floor(carryCapacityOf(held, CARRY_CAPACITY_BY_ROLE)),
      },
    };
  }
  if (label.works !== null && label.works.phase !== 'raising') return worksPoster(label.works, now);
  if (label.building !== null) return buildingPoster(label, label.building, view, now);
  if (label.installation?.neutral === true) {
    const { key } = label.installation;
    return {
      ...plain,
      eyebrow: fr.blitz.neutral,
      title: fr.buildings[key],
      lines: [...fundsLines(key), { kind: 'text', text: fr.blitz.unguarded }],
    };
  }
  if (label.objective !== null) {
    const { name, tier, depot, emptied } = label.objective;
    return {
      ...plain,
      eyebrow: fr.objectives.badgeKicker,
      title: name,
      lines: [
        { kind: 'text', text: tier },
        emptied
          ? { kind: 'text', text: fr.objectives.emptied }
          : { kind: 'row', label: fr.objectives.depot, value: depot },
      ],
    };
  }
  if (label.camp !== null) {
    const camp = view.camps.find((candidate) => candidate.id === label.camp?.id);
    if (camp === undefined) return null;
    return sighting(fr.posters.surveyed(asClockTime(surveyedAt(camp))), fr.posters.standing, []);
  }
  if (label.anchor.kind !== 'movementHead') return null;
  const arcId = label.anchor.arc;
  const arc = view.arcs.find((candidate) => candidate.id === arcId);
  switch (arc?.state) {
    case 'mine':
      return {
        ...plain,
        eyebrow: fr.posters.myMovement,
        title: stackLabel(arc.stack),
        lines: [
          {
            kind: 'row',
            label: fr.posters.route(arc.originLabel, arc.destinationLabel),
            value: asClockTime(view.loadedAt + arc.minutesLeft * 60_000),
          },
          // Ce que le cartouche disait de plus — retenue, charge, mission — ne se perd pas.
          ...label.lines.flatMap((line) =>
            line.role === 'figures' || line.role === 'mention'
              ? [{ kind: 'text', text: line.text } as const]
              : [],
          ),
        ],
        bar: arc.progress,
        loading: loadingUntilOf(arc),
      };
    case 'lastKnown':
      return sighting(fr.posters.surveyed(asClockTime(arc.lastSeenAt)), fr.posters.moving, [
        { kind: 'text', text: fr.posters.unknown },
      ]);
    case 'enemyDetected': {
      const known = arc.identification;
      return sighting(fr.posters.surveyed(asClockTime(arc.since)), fr.posters.moving, [
        {
          kind: 'text',
          text: known.pierced
            ? fr.posters.pierced(fr.movementTypes[known.type], stackLabel(known.stack))
            : fr.posters.unknown,
        },
        ...(arc.estimatedMinutesLeft === null
          ? []
          : [
              {
                kind: 'row',
                label: fr.posters.estimatedArrival,
                value: fr.posters.estimatedTime(
                  asClockTime(view.loadedAt + arc.estimatedMinutesLeft * 60_000),
                ),
              } as const,
            ]),
        ...(arc.headingAtMe
          ? [
              {
                kind: 'chip',
                label: fr.posters.heading,
                chip: fr.posters.headingAtMe,
                tone: 'cut',
              } as const,
            ]
          : []),
      ]);
    }
    default:
      return null;
  }
}

function sighting(eyebrow: string, title: string, lines: ReadonlyArray<PosterLine>): Poster {
  // Un camp ne se compose jamais, même percé : la phrase le dit une fois.
  const said = lines.length === 0 ? [{ kind: 'text', text: fr.posters.unknown } as const] : lines;
  return { ...plain, eyebrow, title, washed: true, lines: said };
}

/** Ce que la pile attend, posée ou en garnison, à la seconde : la plus longue recharge (B19), et
 *  l'artillerie posée depuis moins que sa mise en batterie (B20). */
function waitingChips(held: ReadonlyArray<TroopView>, now: number): PosterLine[] {
  const reload = Math.max(0, ...held.map((troop) => (troop.reloadUntil ?? 0) - now));
  const emplacing = Math.max(0, ...held.map((troop) => (troop.emplacedAt ?? 0) - now));
  return [
    ...(reload > 0
      ? [
          {
            kind: 'chip' as const,
            label: fr.reload.label,
            chip: reloadClock(reload),
            tone: 'cut' as const,
          },
        ]
      : []),
    ...(emplacing > 0
      ? [
          {
            kind: 'chip' as const,
            label: fr.battery.label,
            chip: reloadClock(emplacing),
            tone: 'ok' as const,
          },
        ]
      : []),
  ];
}

function buildingPoster(
  label: MapLabel,
  building: NonNullable<MapLabel['building']>,
  view: PlayerView,
  now: number,
): Poster {
  const garrison = troopsAt(
    view.me,
    stationKeyOf({ kind: 'building', buildingId: building.id }),
    marchingTroopIds(view.arcs),
  );
  const lines: PosterLine[] = [
    ...(view.mode === 'blitz' ? fundsLines(building.key) : []),
    ...waitingChips(garrison, now),
  ];
  let bar: number | null = null;

  if (produces(building.key)) {
    const rate = rateOf(building, view);
    if (rate !== null)
      lines.push({
        kind: 'row',
        label: fr.resources[rate.resource],
        value: fr.posters.perHour(
          rate.perHour.toLocaleString('fr-FR', { maximumFractionDigits: 1 }),
        ),
      });
    // Rien n'est dit plutôt qu'un « relié » supposé.
    const linked = view.me.regions.find((region) => region.id === building.regionId)?.linked;
    if (linked !== undefined)
      lines.push({
        kind: 'chip',
        label: fr.posters.network,
        chip: linked ? fr.posters.linked : fr.stamps.unlinkedBy(view.me.unlinkedShare),
        tone: linked ? 'ok' : 'cut',
      });
    // Le lot est celui de la chaîne, pas du site : il ne se lit sur un site que s'il en est le seul.
    const chain = view.me.chains.find((candidate) => candidate.by === building.key);
    const order = chain?.level === building.level ? chain.order : null;
    if (order !== null && order.produced < order.ordered) {
      lines.push({
        kind: 'row',
        label: fr.posters.lot,
        value: fr.posters.lotProgress(order.produced, order.ordered),
      });
      bar = order.produced / order.ordered;
    }
  }

  /** **La carte que cherche mon Centre de recherche** (#123) : son nom, ce qui lui reste, sa barre. */
  const research =
    searcherOf(view.me.buildings)?.id === building.id ? view.me.research.running : null;
  if (research !== null) {
    const { share, finishesAt } = researchProgressOf(research, now);
    lines.push({
      kind: 'row',
      label: fr.research.header,
      value: `${cardName(research.card)} · ${
        finishesAt === null
          ? fr.research.waiting
          : fr.research.left(asDuration((finishesAt - now) / 60_000))
      }`,
    });
    bar = share;
  }

  const works = label.works;
  if (works?.finishesAt != null) {
    lines.push(left(works.finishesAt, now));
    bar = riseOf((works.finishesAt - now) / 60_000, works.minutes);
  }

  return {
    ...plain,
    eyebrow: (works === null ? fr.posters.site : fr.posters.raisingSite)(building.regionName),
    title:
      works === null
        ? fr.posters.building(fr.buildings[building.key], building.level)
        : fr.posters.raising(fr.buildings[building.key], building.level, works.level),
    lines,
    bar,
  };
}

/** A site where nothing stands yet: its plan in the queue, or its first level rising. */
function worksPoster(works: WorkSite, now: number): Poster {
  const title = fr.posters.building(fr.buildings[works.key], works.level);
  if (works.finishesAt === null)
    return {
      ...plain,
      eyebrow: fr.posters.queuedSite(works.regionName),
      title,
      lines: [{ kind: 'text', text: fr.posters.queued(works.rank) }],
    };
  return {
    ...plain,
    eyebrow: fr.posters.worksSite(works.regionName),
    title,
    lines: [left(works.finishesAt, now)],
    bar: riseOf((works.finishesAt - now) / 60_000, works.minutes),
  };
}

const left = (dueAt: number, now: number): PosterLine => ({
  kind: 'row',
  label: fr.posters.left,
  value: asDuration((dueAt - now) / 60_000),
});

/**
 * An extractor reads its own site. A chain is served summed over its sites, and its rate is
 * linear in the level (« deux arsenaux au niveau 1 convertissent ce qu'un au niveau 2 ») — so
 * a site's share is its level's.
 */
function rateOf(
  building: NonNullable<MapLabel['building']>,
  view: PlayerView,
): { readonly resource: keyof typeof fr.resources; readonly perHour: number } | null {
  const site = view.me.extraction.find(
    (candidate) => candidate.key === building.key && candidate.regionId === building.regionId,
  );
  if (site !== undefined)
    return site.deposit === null
      ? null
      : { resource: YIELD_OF[site.deposit], perHour: site.perHour };
  const chain = view.me.chains.find((candidate) => candidate.by === building.key);
  if (chain === undefined || chain.level === 0) return null;
  return { resource: chain.output, perHour: (chain.perHour * building.level) / chain.level };
}

const natureOf = (label: MapLabel): string =>
  label.lines.flatMap((line) => (line.role === 'nature' ? [line.text] : []))[0] ?? '';

/** **Ce qu'un site verse en Blitz** : une ville et le QG, chaque minute, à qui les tient. */
const fundsLines = (key: BuildingKey): ReadonlyArray<PosterLine> => {
  const income = incomePerMinute([key]);
  return income === 0
    ? []
    : [{ kind: 'row', label: fr.blitz.funds, value: fr.blitz.perMinute(income) }];
};
