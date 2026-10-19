import {
  LISTENING_COAL_PER_HOUR,
  OUTPOST_FOOD_PER_HOUR_PER_LEVEL,
  UPKEEP_STEPS,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
} from '../../convex/constants';
import { PRODUCER_OF, YIELD_OF } from './economy';
import type { BuildingKey, ResourceKey } from './ids';
import type { PlayerView } from './player-view';
import { cumulative } from './upkeep';

/**
 * **Le registre d'une réserve** (issue #121) : ce qui l'alimente et ce qui la ronge, ventilé depuis
 * ce que la vue sert déjà — `me.upkeep`, `me.extraction`, `me.chains`, les avant-postes. Une seule
 * source pour les chiffres : le solde est la somme des totaux, et il égale le débit net du
 * bandeau (`me.resources[r].ratePerHour`), que `ledger.test.ts` vérifie sur une vue complète.
 *
 * Le texte vit dans `fr.ts` : les lignes ne portent que ce qu'il faut pour le dire.
 */
export type LedgerWhat =
  | {
      readonly kind: 'site';
      readonly building: BuildingKey;
      readonly region: string;
      readonly level: number;
      readonly linked: boolean;
    }
  | { readonly kind: 'chain'; readonly building: BuildingKey; readonly level: number }
  | {
      readonly kind: 'ranks';
      readonly from: number;
      readonly to: number;
      readonly rate: number;
      readonly outside: boolean;
    }
  | { readonly kind: 'outpost'; readonly region: string | null; readonly level: number }
  | { readonly kind: 'station'; readonly region: string | null; readonly outpost: boolean };

export type LedgerRow = { readonly what: LedgerWhat; readonly perHour: number };

export type LedgerSectionId = 'buildings' | 'troops' | 'outposts' | 'listening' | 'factory';

export type LedgerSection = {
  readonly id: LedgerSectionId;
  /** Le total de la catégorie, signé : positif produit, négatif consomme. */
  readonly perHour: number;
  readonly rows: ReadonlyArray<LedgerRow>;
};

export type Ledger = {
  readonly production: number;
  readonly consumption: number;
  readonly balance: number;
  readonly sections: ReadonlyArray<LedgerSection>;
};

/** Les catégories que chaque réserve connaît, dans l'ordre où le ticket les range. */
const SECTIONS_OF: Readonly<Record<ResourceKey, ReadonlyArray<LedgerSectionId>>> = {
  food: ['buildings', 'troops', 'outposts'],
  steel: ['buildings', 'factory'],
  coal: ['buildings', 'factory', 'listening'],
  oil: ['buildings', 'factory'],
  ammunition: ['factory'],
};

export function ledgerOf(view: PlayerView, resource: ResourceKey): Ledger {
  const { me } = view;
  const regionName = (id: string | null): string | null =>
    me.regions.find((region) => region.id === id)?.name ?? null;

  const build: Record<LedgerSectionId, () => LedgerSection> = {
    buildings: () => {
      const rows = me.extraction
        .filter((site) => site.deposit !== null && YIELD_OF[site.deposit] === resource)
        .map((site) => ({
          what: {
            kind: 'site' as const,
            building: site.key,
            region: regionName(site.regionId) ?? site.regionId,
            level: site.level,
            linked: site.linked,
          },
          perHour: site.perHour,
        }));
      return { id: 'buildings', perHour: sum(rows), rows };
    },
    factory: () => {
      const rows: LedgerRow[] = [];
      for (const chain of me.chains) {
        const what = { kind: 'chain' as const, building: chain.by, level: chain.level };
        if (chain.output === resource) rows.push({ what, perHour: chain.perHour });
        const input = chain.inputs.find((candidate) => candidate.resource === resource);
        if (input !== undefined) rows.push({ what, perHour: -chain.perHour * input.quantity });
      }
      return { id: 'factory', perHour: sum(rows), rows };
    },
    troops: () => {
      const { troops, unsupplied, foodPerHour } = me.upkeep;
      const plain = troops - unsupplied;
      const rows: LedgerRow[] = [];
      let from = 0;
      for (const { upTo, rate } of UPKEEP_STEPS) {
        const overlap = (start: number, end: number) =>
          Math.max(0, Math.min(end, upTo) - Math.max(start, from));
        const near = overlap(0, plain);
        const far = overlap(plain, troops);
        if (near > 0)
          rows.push({
            what: { kind: 'ranks', from: from + 1, to: from + near, rate, outside: false },
            perHour: -(cumulative(from + near) - cumulative(from)),
          });
        if (far > 0) {
          const first = Math.max(from, plain) + 1;
          rows.push({
            what: { kind: 'ranks', from: first, to: first + far - 1, rate, outside: true },
            perHour:
              -(cumulative(first + far - 1) - cumulative(first - 1)) * UPKEEP_UNSUPPLIED_MULTIPLIER,
          });
        }
        from = upTo;
      }
      return { id: 'troops', perHour: -foodPerHour, rows };
    },
    outposts: () => {
      const rows = standing(view).map((outpost) => ({
        what: {
          kind: 'outpost' as const,
          region: regionName(outpost.regionId),
          level: outpost.level,
        },
        perHour: -OUTPOST_FOOD_PER_HOUR_PER_LEVEL * outpost.level,
      }));
      return { id: 'outposts', perHour: -me.upkeep.outpostFoodPerHour, rows };
    },
    listening: () => {
      const rows: LedgerRow[] = [
        ...me.buildings
          .filter((building) => building.key === 'listening' && !building.disabled)
          .map((building) => ({
            what: {
              kind: 'station' as const,
              region: regionName(building.regionId),
              outpost: false,
            },
            perHour: -LISTENING_COAL_PER_HOUR,
          })),
        ...standing(view)
          .filter(
            (outpost) =>
              outpost.specialization === 'listening' && outpost.disabledMinutesLeft === null,
          )
          .map((outpost) => ({
            what: { kind: 'station' as const, region: regionName(outpost.regionId), outpost: true },
            perHour: -LISTENING_COAL_PER_HOUR,
          })),
      ];
      return { id: 'listening', perHour: -me.upkeep.listeningCoalPerHour, rows };
    },
  };

  const sections = SECTIONS_OF[resource].map((id) => build[id]());
  const production = sections.reduce(
    (total, section) => total + section.rows.reduce((up, row) => up + Math.max(0, row.perHour), 0),
    0,
  );
  const balance = sum(sections);
  return { production, consumption: balance - production, balance, sections };
}

const sum = (lines: ReadonlyArray<{ readonly perHour: number }>): number =>
  lines.reduce((total, line) => total + line.perHour, 0);

/** Mes avant-postes debout : un chantier ne mange pas encore. */
const standing = (view: PlayerView) =>
  view.me.outposts.filter(
    (outpost) => outpost.isMine && (outpost.standsAt === null || outpost.standsAt <= view.loadedAt),
  );

/**
 * **Où va la réserve** : à sec dans tant d'heures, pleine dans tant d'heures, ou stable. `hours` est
 * l'horizon au débit net ; le bandeau, lui, ne marque que l'à-sec proche (`drynessOf`).
 */
export type Horizon =
  | { readonly kind: 'dry'; readonly hours: number }
  | { readonly kind: 'full'; readonly hours: number }
  | { readonly kind: 'steady' };

export function horizonOf(stock: number, cap: number, netPerHour: number): Horizon {
  if (stock <= 0) return { kind: 'dry', hours: 0 };
  if (netPerHour < 0) return { kind: 'dry', hours: stock / -netPerHour };
  if (netPerHour > 0 && stock < cap) return { kind: 'full', hours: (cap - stock) / netPerHour };
  return { kind: 'steady' };
}

/**
 * **Ce que le ticket dit à côté de ses chiffres** : ce qui arrête une réserve, et ce qui la
 * répare — on ne perd jamais le joueur (ADR 0028 §1). Le bac plein se dit déjà dans le diagnostic
 * du ticket (`marksOf`).
 */
export type LedgerNote =
  | { readonly kind: 'starving' }
  | { readonly kind: 'starvedChain'; readonly building: BuildingKey; readonly missing: ResourceKey }
  | { readonly kind: 'listeningSilent' }
  | { readonly kind: 'noProducer'; readonly producer: BuildingKey };

export function ledgerNotesOf(view: PlayerView, resource: ResourceKey): ReadonlyArray<LedgerNote> {
  const { me } = view;
  const producer = PRODUCER_OF[resource];
  /** Rien ne la produit : ni bâti, ni en chantier, ni en file — le manque, pas la panne. */
  const unproduced =
    me.resources[resource].ratePerHour <= 0 &&
    !me.buildings.some((building) => building.key === producer) &&
    me.construction?.key !== producer &&
    !me.constructionQueue.some((entry) => entry.key === producer);
  return [
    ...(resource === 'food' && me.starving ? [{ kind: 'starving' as const }] : []),
    ...me.chains.flatMap((chain) =>
      chain.level > 0 &&
      chain.state === 'starved' &&
      chain.missing !== null &&
      (chain.missing === resource || chain.output === resource)
        ? [{ kind: 'starvedChain' as const, building: chain.by, missing: chain.missing }]
        : [],
    ),
    ...(resource === 'coal' && me.upkeep.listeningSilent
      ? [{ kind: 'listeningSilent' as const }]
      : []),
    ...(unproduced ? [{ kind: 'noProducer' as const, producer }] : []),
  ];
}
