import { fr, stackLabel } from '@/i18n/fr';
import { asClockTime } from './duration';
import { produces } from './economy';
import { isCountdown, type MapLabel } from './labels';
import { pileSheet, type SheetLine } from './pile-pieces';
import type { CargoView, PlayerView } from './player-view';
import { marchingTroopIds, stationKeyOf, troopsAt } from './troops';

export type PosterLine =
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
  readonly pile: {
    readonly lines: ReadonlyArray<SheetLine>;
    readonly cargo: ReadonlyArray<CargoView>;
  } | null;
};

const plain = { washed: false, lines: [], bar: null, pile: null } as const;

export function posterOf(label: MapLabel, view: PlayerView, now: number): Poster | null {
  if (label.type === 'stack' && label.station !== null) {
    const held = troopsAt(view.me, stationKeyOf(label.station), marchingTroopIds(view.arcs));
    if (held.length === 0) return null;
    const ids = new Set(held.map((troop) => troop.id));
    return {
      ...plain,
      eyebrow: fr.troops.sheetKicker,
      title: natureOf(label),
      pile: {
        lines: pileSheet(held),
        cargo: view.me.stationedCargo
          .filter((group) => group.troopIds.some((id) => ids.has(id)))
          .map((group) => group.cargo),
      },
    };
  }
  if (label.building !== null) return buildingPoster(label, label.building, view, now);
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
    const seenAt =
      camp.seenMinutesAgo === null ? camp.since : view.loadedAt - camp.seenMinutesAgo * 60_000;
    return sighting(fr.posters.surveyed(asClockTime(seenAt)), fr.posters.standing, []);
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
      };
    case 'lastKnown':
      return sighting(
        fr.posters.surveyed(asClockTime(view.loadedAt - arc.seenMinutesAgo * 60_000)),
        fr.posters.moving,
        [{ kind: 'text', text: fr.posters.unknown }],
      );
    case 'enemyDetected': {
      const known = arc.identification;
      return sighting(fr.posters.inSight, fr.posters.moving, [
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

function buildingPoster(
  label: MapLabel,
  building: NonNullable<MapLabel['building']>,
  view: PlayerView,
  now: number,
): Poster {
  const lines: PosterLine[] = [];
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
        chip: linked ? fr.posters.linked : fr.posters.unlinked,
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

  const works = label.lines.find(isCountdown);
  const full = view.me.buildings.find((candidate) => candidate.id === building.id);
  if (works !== undefined && full !== undefined) {
    lines.push({ kind: 'row', label: fr.posters.works, value: asClockTime(works.dueAt) });
    // L'élévation en cours est celle que `nextLevelMinutes` chiffre : le niveau servi est
    // encore celui d'avant.
    const total = full.nextLevelMinutes * 60_000;
    bar = Math.min(1, Math.max(0, 1 - (works.dueAt - now) / total));
  }

  return {
    ...plain,
    eyebrow: fr.posters.site(building.regionName),
    title: fr.posters.building(fr.buildings[building.key], building.level),
    lines,
    bar,
  };
}

/**
 * An extractor reads its own site. A chain is served summed over its sites, and its rate is
 * linear in the level (« deux fonderies au niveau 1 convertissent ce qu'une au niveau 2 ») — so
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
    return site.deposit === null ? null : { resource: site.deposit, perHour: site.perHour };
  const chain = view.me.chains.find((candidate) => candidate.by === building.key);
  if (chain === undefined || chain.level === 0) return null;
  return { resource: chain.output, perHour: (chain.perHour * building.level) / chain.level };
}

const natureOf = (label: MapLabel): string =>
  label.lines.flatMap((line) => (line.role === 'nature' ? [line.text] : []))[0] ?? '';
