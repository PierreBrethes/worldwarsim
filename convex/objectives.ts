/**
 * **Les objectifs neutres** (`propositions/objectifs-neutres.md`, réécrit le 17/09/2026) : ce
 * module les pose au lancement et les lit ; la règle de répartition est pure et testée sans base
 * (`src/domain/objective-placement.ts`), et ce qui se bat n'est pas ici du tout.
 *
 * **Il n'y a pas d'intelligence artificielle, et c'est tout l'intérêt.** Une garnison locale est
 * une force posée qui défend le sol où elle se tient et n'ordonne jamais rien — la définition mot
 * pour mot de l'ADR 0019 §3. Elle appartient à un `players` marqué `irregular`, ses troupes sont
 * des `troops` ordinaires, elle se relève comme toute force posée (ADR 0024 §1), elle riposte dans
 * la même passe à l'initiative (ADR 0014) — protégée, c'est une garnison — et elle meurt de la même façon. Rien de tout cela n'est
 * écrit ici : c'est le moteur qui existait déjà.
 *
 * Ce que ce module ajoute au jeu tient en une phrase : **attaquer rapporte**, avant que le front
 * joueur-contre-joueur soit ouvert.
 */

import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { emptyStocks } from '../src/domain/economy';
import type { LonLat } from '../src/domain/geo';
import { NATIONS, RESOURCES } from '../src/domain/ids';
import { ADM0_BY_NATION, isNation } from '../src/domain/nations';
import { planObjectives, type ObjectiveCandidate } from '../src/domain/objective-placement';
import { KM_PER_UNIT } from '../src/domain/routing';
import { playerBuildings } from './buildingReads';
import {
  DEFAULT_REST_WINDOW,
  nominalStrength,
  OBJECTIVE_AMMUNITION_PER_TROOP,
  OBJECTIVE_ARCHETYPES,
  OBJECTIVE_HARD_FAIRNESS,
  OBJECTIVE_HARD_MAX,
  OBJECTIVE_HARD_MIN_KM,
  OBJECTIVE_NEAR_KM,
  OBJECTIVE_SPREAD_KM,
  objectiveArchetype,
  type ObjectiveArchetype,
} from './constants';
import { allRegions, capitalRegionOf, pointOfBuilding, regionFacts } from './regions';
import { routeBetween, routeKmFrom } from './routes';
import { seatsOf } from './seats';

export const seasonObjectives = (
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'objectives'>>> =>
  ctx.db
    .query('objectives')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();

/**
 * **Ce que la pose a besoin de lire dans la base**, et rien de plus : les sièges, leur point de
 * départ, et le germe de la saison. C'est une query parce que c'est une lecture — et parce que
 * l'action qui suit n'a pas de base sous la main, seulement le droit d'en appeler une.
 *
 * `null` dit « il n'y a rien à poser », et il le dit pour les trois raisons qui se confondraient
 * dans une liste vide : la saison n'est pas lancée, elle porte déjà ses objectifs, ou personne
 * n'y est assis.
 */
export const placementInput = internalQuery({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched') return null;
    if ((await seasonObjectives(ctx, seasonId)).length > 0) return null;

    const seats = (await seatsOf(ctx, seasonId)).filter((seat) => isNation(seat.nation));
    if (seats.length === 0) return null;

    const placing: Array<{ id: string; hq: LonLat }> = [];
    for (const seat of seats) {
      const point = await headquartersOf(ctx, seat);
      if (point !== null) placing.push({ id: seat._id as string, hq: point });
    }
    return {
      seed: season.seed,
      seats: placing,
      /** Les nations des sièges **tous** — la dépêche d'une paire sans réserve nomme deux
       *  joueurs, y compris celui dont le quartier général n'a pas été trouvé. */
      homes: seats.flatMap((seat) => (isNation(seat.nation) ? [ADM0_BY_NATION[seat.nation]] : [])),
    };
  },
});

/**
 * **La pose est une action, et c'est une contrainte de production, pas un goût** : un champ de
 * distances de route par quartier général et une route par paire de voisins ne tiennent pas dans
 * la seconde d'une mutation sur le VPS. Une action n'a pas de plafond d'une seconde — elle n'a
 * pas de transaction non plus, d'où le découpage : **lire** (`placementInput`), **calculer** ici,
 * **écrire** en une transaction (`commit`).
 *
 * Ce que le découpage ne change pas : le calcul reste **reproductible**. Le tirage sort du germe
 * de la saison et non de `Math.random`, donc deux exécutions de l'action sur la même saison
 * proposent la même carte — et `commit` refuse la seconde de toute façon.
 *
 * **Mesuré : 690 à 710 ms sur huit sièges** (18 objectifs posés — 8 champs combinés bornés à
 * `OBJECTIVE_NEAR_KM`, 28 paires pesées à vol d'oiseau, 4 retenues et leurs 8 champs terrestres
 * bornés à la route entre les deux quartiers généraux). C'est **chaud, sur une machine de
 * développement** : c'est 70 % du plafond d'une mutation avant même que le VPS et un isolat sans
 * JIT s'en mêlent — la même erreur d'échelle que les « 31 ms » de `buildGrid` (`convex/routes.ts`),
 * qui valaient des secondes à froid. Une mutation n'était pas serrée, elle était déjà perdue.
 */
export const place = internalAction({
  args: { seasonId: v.id('seasons') },
  handler: async (ctx, { seasonId }): Promise<void> => {
    const input = await ctx.runQuery(internal.objectives.placementInput, { seasonId });
    if (input === null) return;

    /** Le sol candidat est lu **une fois** : les 4 589 régions se filtrent en une passe, et la
     *  mesure le relit à chaque siège et à chaque paire. */
    const candidates = neutralGround(new Set(input.homes));
    const places = placesOf(candidates);
    const seats = input.seats.map((seat) => ({ id: seat.id, hq: seat.hq as LonLat }));

    const plan = planObjectives({
      seats,
      candidates,
      archetypes: OBJECTIVE_ARCHETYPES,
      rules: {
        nearKm: OBJECTIVE_NEAR_KM,
        spreadKm: OBJECTIVE_SPREAD_KM,
        hardMinKm: OBJECTIVE_HARD_MIN_KM,
        hardFairness: OBJECTIVE_HARD_FAIRNESS,
        hardMax: OBJECTIVE_HARD_MAX,
      },
      seed: input.seed,
      measure: {
        /**
         * **Ce qu'un siège peut aller chercher**, et il peut embarquer : la mesure est
         * *combinée*, l'eau comprise (ADR 0013). En terrestre pur, un joueur insulaire n'aurait
         * **aucune** réserve à portée — Londres ne touche par la route que du sol britannique —
         * et le détour que ce lot existe pour créer n'existerait pas chez lui.
         */
        nearKmFrom: (seat) => routeKmFrom(seat.hq, places, 'combined', OBJECTIVE_NEAR_KM),
        between: (left, right) => {
          /**
           * **Le dur se mesure à pied, et il n'y en a pas quand un océan sépare les deux** : ce
           * qu'on cherche est un sol que les deux disputent, donc un sol que les deux foulent.
           * C'est la différence avec la prise proche juste au-dessus, qui mesure ce qu'un siège
           * peut *aller chercher* et non ce qu'il partage avec un voisin.
           *
           * **La route entre les deux quartiers généraux borne les deux champs**, et c'est la
           * seule chose qu'il faille chercher au loin : aucun milieu de route ne peut coûter à
           * l'un des deux plus que le trajet entier vers l'autre. Sans cette borne, la paire
           * payait un champ mondial — cent vingt millisecondes chacun au lieu de trente.
           */
          const road = routeBetween(left.hq, right.hq, 'land');
          if (road === null) return null;
          const reach = road.distanceUnits * KM_PER_UNIT;
          return {
            fromLeft: routeKmFrom(left.hq, places, 'land', reach),
            fromRight: routeKmFrom(right.hq, places, 'land', reach),
          };
        },
      },
    });

    if (plan.placed.length === 0 && plan.pairsWithoutObjective.length === 0) return;
    await ctx.runMutation(internal.objectives.commit, {
      seasonId,
      placements: plan.placed.map((entry) => ({ key: entry.key, regionId: entry.regionId })),
      gaps: plan.pairsWithoutObjective.map(([left, right]) => ({ left, right })),
    });
  },
});

/**
 * **L'écriture, en une transaction** : le siège irrégulier, les objectifs, leurs garnisons et les
 * dépêches. Ce qu'elle ne fait pas est aussi important — elle ne mesure rien, donc elle tient
 * dans le budget d'une mutation quel que soit le nombre de sièges.
 *
 * **Idempotente** : une saison qui porte déjà un objectif ne se repose pas. Deux actions
 * planifiées, un travail repris, un appel à la main — aucun ne double un dépôt ni une garnison,
 * et c'est la base qui l'arbitre, jamais l'appelant.
 */
export const commit = internalMutation({
  args: {
    seasonId: v.id('seasons'),
    placements: v.array(v.object({ key: v.string(), regionId: v.string() })),
    gaps: v.array(v.object({ left: v.string(), right: v.string() })),
  },
  handler: async (ctx, { seasonId, placements, gaps }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'launched') return;
    if ((await seasonObjectives(ctx, seasonId)).length > 0) return;

    const seats = (await seatsOf(ctx, seasonId)).filter((seat) => isNation(seat.nation));
    if (seats.length === 0) return;

    const now = Date.now();
    const written: Array<Doc<'objectives'>> = [];
    if (placements.length > 0) {
      /** **Le siège irrégulier naît avec la première garnison**, jamais avant : un théâtre où la
       *  carte n'a rien placé n'a personne à faire tenir, et une place vide de plus serait une
       *  ligne que tout comptage devrait apprendre à ignorer pour rien. */
      const irregularId = await irregularSeat(ctx, seasonId);
      for (const entry of placements) {
        const archetype = objectiveArchetype(entry.key);
        const region = regionFacts(entry.regionId);
        if (archetype === null || region === null) continue;
        written.push(await raise(ctx, seasonId, irregularId, archetype, region));
      }
      await endowIrregular(ctx, irregularId, now);
    }

    /**
     * **Public, et à tout le monde en même temps** — c'est le garde-fou de la proposition du
     * 29/08 : un PVE que chacun découvre dans son coin fait farmer côte à côte, un PVE annoncé
     * fait converger. Ce qu'on annonce est le lieu et l'archétype ; la garnison, jamais.
     */
    const nameOf = new Map(seats.map((seat) => [seat._id as string, seat.nation ?? seat.nickname]));
    for (const seat of seats) {
      for (const objective of written) {
        await ctx.db.insert('notices', {
          playerId: seat._id,
          at: now,
          kind: 'objectiveRevealed',
          objective: objective.key,
          hostCountry: regionFacts(objective.regionId)?.country ?? '',
          regionId: objective.regionId,
        });
      }
      for (const { left, right } of gaps) {
        await ctx.db.insert('notices', {
          playerId: seat._id,
          at: now,
          kind: 'objectiveGap',
          nations: [nameOf.get(left) ?? left, nameOf.get(right) ?? right],
        });
      }
    }
  },
});

const placesOf = (
  candidates: ReadonlyArray<ObjectiveCandidate>,
): ReadonlyArray<{ readonly id: string; readonly point: LonLat }> =>
  candidates.map((candidate) => ({ id: candidate.regionId, point: candidate.point }));

/**
 * **Le sol sans siège**, et rien d'autre : un objectif ne se pose jamais chez un joueur — ce
 * serait lui offrir sa réserve — ni sur la région d'une capitale de 1940, jouée ou non : c'est le
 * seul point qu'on connaisse d'une nation avant qu'elle ait rien bâti (`CAPITAL_REGION`), et une
 * garnison neutre dessus rendrait injouable une entrée en guerre tardive.
 */
function neutralGround(homes: ReadonlySet<string>): ReadonlyArray<ObjectiveCandidate> {
  const capitals = new Set(NATIONS.map((nation) => capitalRegionOf(nation)));
  return allRegions().flatMap((region) =>
    homes.has(region.country) || capitals.has(region.id)
      ? []
      : [{ regionId: region.id, point: region.point }],
  );
}

/**
 * **D'où se mesure la distance d'un joueur à une réserve** : son quartier général s'il en a un,
 * sa capitale de 1940 sinon. Au lancement c'est toujours la seconde — le QG se **pose** depuis la
 * décision 1b du 13/09, et personne n'a encore rien bâti —, et c'est exactement ce que
 * `CAPITAL_REGION` est : le seul point qu'on connaisse d'une nation qui n'a rien debout.
 */
async function headquartersOf(ctx: QueryCtx, seat: Doc<'players'>): Promise<LonLat | null> {
  if (!isNation(seat.nation)) return null;
  const hq = (await playerBuildings(ctx, seat._id)).find((building) => building.key === 'hq');
  if (hq !== undefined) {
    const point = pointOfBuilding(hq);
    if (point !== null) return point;
  }
  return regionFacts(capitalRegionOf(seat.nation))?.point ?? null;
}

/** L'objectif et sa garnison, écrits ensemble : l'un sans l'autre serait un dépôt sans serrure. */
async function raise(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  irregularId: Id<'players'>,
  archetype: ObjectiveArchetype,
  region: { readonly id: string; readonly point: LonLat },
): Promise<Doc<'objectives'>> {
  const depot = emptyStocks();
  for (const resource of RESOURCES) depot[resource] = archetype.depot[resource] ?? 0;
  const point = { lon: region.point[0], lat: region.point[1] };
  const objectiveId = await ctx.db.insert('objectives', {
    seasonId,
    key: archetype.key,
    regionId: region.id,
    point,
    depot,
    status: 'standing',
    takenAt: null,
  });
  for (const unit of archetype.garrison) {
    const strength = nominalStrength(unit.role, unit.tier);
    await ctx.db.insert('troops', {
      seasonId,
      playerId: irregularId,
      role: unit.role,
      tier: unit.tier,
      nominalStrength: strength,
      currentStrength: strength,
      /** Posée sur le point de l'objectif : une adresse de campagne, celle qui se relève et se
       *  bat (ADR 0024 §1) — jamais un bâtiment ni un avant-poste, qui n'existent pas ici. */
      stationedAt: point,
    });
  }
  return (await ctx.db.get(objectiveId))!;
}

/**
 * **Le siège irrégulier** : un `players` sans compte, sans nation et sans vue. Il n'est pas un
 * joueur et rien ne doit le compter comme tel — c'est `seatsOf` qui l'écarte, en une ligne, pour
 * tout ce qui demande « qui joue ici ».
 *
 * `enteredWarAt: null` explicitement, et ce n'est pas du zèle : sur une saison lancée, un champ
 * *absent* vaut « entré à l'ouverture » (`warEntryOf`), donc le silence en aurait fait un
 * belligérant de plus au classement et à la presse.
 */
export async function irregularSeat(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
): Promise<Id<'players'>> {
  const already = (
    await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect()
  ).find((seat) => seat.irregular === true);
  if (already !== undefined) return already._id;

  return ctx.db.insert('players', {
    seasonId,
    irregular: true,
    /** Un code, jamais une phrase (ADR 0016) : rien de ceci n'est affiché, et le jour où une
     *  dépêche nommerait la garnison, elle passerait par `fr.objectives`. */
    nickname: 'irregular',
    creator: false,
    nation: null,
    ready: false,
    restWindow: DEFAULT_REST_WINDOW,
    enteredWarAt: null,
  });
}

/**
 * **Des munitions, et rien d'autre.** Le combat lit le magasin de chaque camp avant la passe
 * (`convex/combat.ts`) et refuse une ligne de stock manquante : sans dotation, la première
 * attaque sur un objectif tomberait sur `MISSING_RESOURCE`. Le reste est à zéro, et c'est la
 * règle — *elle ne se renforce jamais, ne se déroute pas, ne mange pas* : aucune extraction,
 * aucune chaîne, aucun entretien (`upkeepOf` l'ignore).
 */
export async function endowIrregular(
  ctx: MutationCtx,
  playerId: Id<'players'>,
  at: number,
): Promise<void> {
  const held = await ctx.db
    .query('resources')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  if (held.length > 0) return;
  const troops = await ctx.db
    .query('troops')
    .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
    .collect();
  for (const key of RESOURCES) {
    await ctx.db.insert('resources', {
      playerId,
      key,
      stock: key === 'ammunition' ? troops.length * OBJECTIVE_AMMUNITION_PER_TROOP : 0,
      updatedAt: at,
    });
  }
}
