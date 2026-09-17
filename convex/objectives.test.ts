import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConvexError } from 'convex/values';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { RESOURCES } from '../src/domain/ids';
import { carryCapacityOf } from '../src/domain/loot';
import { OBJECTIVE_SPRITES } from '../src/emblems/objectives/manifest';
import {
  CARRY_CAPACITY_BY_ROLE,
  nominalStrength,
  OBJECTIVE_ARCHETYPES,
  OBJECTIVE_HARD_FAIRNESS,
  OBJECTIVE_HARD_MAX,
  OBJECTIVE_HARD_MIN_KM,
  OBJECTIVE_NEAR_KM,
  OBJECTIVE_SPREAD_KM,
  objectiveArchetype,
} from './constants';
import { capitalRegionOf, regionFacts } from './regions';
import { routeKmFrom } from './routes';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Les objectifs neutres, du lancement à la prise.** Trois sujets et ils ne se mélangent pas :
 * la **pose** (où, combien, jamais où c'est interdit), le **siège irrégulier** (personne ne doit
 * le compter pour un joueur), et la **prise** (réduire, emporter, laisser le reste).
 *
 * La règle de répartition elle-même est pure et testée sans base
 * (`src/domain/objective-placement.test.ts`) : ce qui se prouve ici est que la carte réelle la
 * nourrit de vraies distances et que le plateau en fait de vrais objets.
 */

const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323';
/** Un sol sans siège, à portée de marche d'une caserne marnaise : c'est là que les cas posent
 *  leur objectif à la main, pour ne pas dépendre du tirage. */
const HAINAUT = 'BEL-2';
const MIDDAY = new Date(2026, 8, 17, 12, 0, 0);

const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
const pointOfRegion = (regionId: string): LonLat => regionFacts(regionId)!.point;

async function playerOf(t: ReturnType<typeof boot>, seat: Seat): Promise<Id<'players'>> {
  return t.run(async (ctx) => (await seatIn(ctx, seat))._id);
}

async function launchedSeason(
  t: ReturnType<typeof boot>,
  nations: ReadonlyArray<'france' | 'uk' | 'germany' | 'ussr' | 'japan' | 'usa'> = [
    'france',
    'ussr',
  ],
): Promise<ReadonlyArray<Seat>> {
  const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
  const seats: Array<Seat> = [seat];
  for (let rank = 1; rank < nations.length; rank += 1) {
    seats.push(await joinSeat(t, code, `Joueur ${rank}`));
  }
  for (const [rank, taken] of seats.entries()) {
    await t.mutation(api.players.reserveNation, { ...taken, nation: nations[rank]! });
    await t.mutation(api.players.declareReady, { ...taken, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  return seats;
}

/** La pose, appelée à la main : le lancement la planifie, et un test n'a pas à courir après un
 *  travail pour lire ce qu'il a écrit. C'est la même action dans les deux cas — elle lit, elle
 *  mesure, puis elle appelle `commit`, et c'est la chaîne entière que ces cas exercent. */
async function place(t: ReturnType<typeof boot>, seat: Seat): Promise<void> {
  await t.action(internal.objectives.place, { seasonId: seat.seasonId });
}

const objectivesIn = (t: ReturnType<typeof boot>): Promise<Array<Doc<'objectives'>>> =>
  t.run(async (ctx) => ctx.db.query('objectives').collect());

const noticesOf = async (t: ReturnType<typeof boot>, seat: Seat, kind: string) => {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    (
      await ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()
    ).filter((notice) => notice.kind === kind),
  );
};

async function raise(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: BuildingKey,
  regionId: string,
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('buildings', { seasonId, playerId, key, regionId, level: 1 });
  });
}

async function form(
  t: ReturnType<typeof boot>,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'>,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, seat);
  const strength = nominalStrength(role, 1);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('troops', {
      seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    });
  });
}

/**
 * **Un objectif posé à la main, sur la région que le cas nomme.** La pose réelle tire au hasard
 * du germe de la saison : un cas de prise qui dépendrait d'elle mesurerait le tirage.
 */
async function plantObjective(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: string,
  regionId: string,
): Promise<Id<'objectives'>> {
  const point = asPoint(pointOfRegion(regionId));
  const archetype = objectiveArchetype(key)!;
  return t.run(async (ctx) => {
    const seasonId = seat.seasonId;
    const irregularId = await ctx.db.insert('players', {
      seasonId,
      irregular: true,
      nickname: 'irregular',
      creator: false,
      nation: null,
      ready: false,
      restWindow: { startMinutes: 0, endMinutes: 0 },
      enteredWarAt: null,
    });
    for (const resource of RESOURCES) {
      await ctx.db.insert('resources', {
        playerId: irregularId,
        key: resource,
        stock: resource === 'ammunition' ? 2_000 : 0,
        updatedAt: Date.now(),
      });
    }
    const irregular = { _id: irregularId };
    const depot = Object.fromEntries(
      RESOURCES.map((resource) => [resource, archetype.depot[resource] ?? 0]),
    ) as Record<(typeof RESOURCES)[number], number>;
    const objectiveId = await ctx.db.insert('objectives', {
      seasonId,
      key,
      regionId,
      point,
      depot,
      status: 'standing',
      takenAt: null,
    });
    for (const unit of archetype.garrison) {
      const strength = nominalStrength(unit.role, unit.tier);
      await ctx.db.insert('troops', {
        seasonId,
        playerId: irregular._id,
        role: unit.role,
        tier: unit.tier,
        nominalStrength: strength,
        currentStrength: strength,
        stationedAt: point,
      });
    }
    return objectiveId;
  });
}

describe('the neutral objectives', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /**
   * **La palette est une donnée, et l'invariant est ce qui l'autorise à le rester** : une entrée
   * sans dépôt, sans garnison ou sans planche serait un objectif que le jeu pose et que personne
   * ne peut prendre ni voir.
   */
  describe('the palette', () => {
    it('holds unique keys, a depot and a garrison on every one of them', () => {
      const keys = OBJECTIVE_ARCHETYPES.map((archetype) => archetype.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const archetype of OBJECTIVE_ARCHETYPES) {
        expect(archetype.garrison.length).toBeGreaterThan(0);
        expect(
          RESOURCES.reduce((sum, resource) => sum + (archetype.depot[resource] ?? 0), 0),
        ).toBeGreaterThan(0);
      }
    });

    /** Une planche ou `null`, explicitement : une clé absente du manifeste est un mât cassé. */
    it('names a plate — or an explicit absence — for every archetype', () => {
      for (const archetype of OBJECTIVE_ARCHETYPES) {
        expect(Object.prototype.hasOwnProperty.call(OBJECTIVE_SPRITES, archetype.key)).toBe(true);
      }
      expect(Object.keys(OBJECTIVE_SPRITES).sort()).toEqual(
        OBJECTIVE_ARCHETYPES.map((archetype) => archetype.key).sort(),
      );
    });
  });

  describe('placing them at launch', () => {
    it('gives every seat two reachable objectives, and the hard ones to the neighbours', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'uk', 'germany', 'ussr']);
      await place(t, seats[0]!);

      const placed = await objectivesIn(t);
      const tierOf = (key: string) => objectiveArchetype(key)!.tier;
      const near = placed.filter((objective) => tierOf(objective.key) !== 'hard');
      const hard = placed.filter((objective) => tierOf(objective.key) === 'hard');
      expect(near).toHaveLength(2 * seats.length);
      expect(hard.length).toBeGreaterThan(0);
      expect(hard.length).toBeLessThanOrEqual(OBJECTIVE_HARD_MAX);

      /** Jamais deux sur la même région, jamais sur un sol de siège, jamais sur une capitale. */
      expect(new Set(placed.map((objective) => objective.regionId)).size).toBe(placed.length);
      const homes = new Set(['FRA', 'GBR', 'DEU', 'RUS']);
      for (const objective of placed) {
        const facts = regionFacts(objective.regionId)!;
        expect(homes.has(facts.country)).toBe(false);
        expect(objective.status).toBe('standing');
      }
      const capitals = new Set(
        (['france', 'uk', 'germany', 'ussr', 'japan', 'usa', 'italy', 'china'] as const).map(
          (nation) => capitalRegionOf(nation),
        ),
      );
      expect(placed.some((objective) => capitals.has(objective.regionId))).toBe(false);
    }, 60_000);

    /**
     * **Chaque prise proche est à portée de son siège, et les deux sont séparées.** Mesuré sur la
     * même grille que la pose : un cas qui mesurerait à vol d'oiseau approuverait une réserve de
     * l'autre côté d'un golfe.
     */
    it('keeps every near objective within reach of its seat, and apart from its twin', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      await place(t, seats[0]!);
      const placed = (await objectivesIn(t)).filter(
        (objective) => objectiveArchetype(objective.key)!.tier !== 'hard',
      );

      for (const nation of ['france', 'ussr'] as const) {
        const hq = pointOfRegion(capitalRegionOf(nation));
        const measured = routeKmFrom(
          hq,
          placed.map((objective) => ({
            id: objective._id as string,
            point: [objective.point.lon, objective.point.lat] as LonLat,
          })),
          'combined',
          OBJECTIVE_NEAR_KM,
        );
        const mine = placed.filter((objective) => measured.has(objective._id));
        expect(mine.length).toBeGreaterThanOrEqual(2);
        /** Les deux du même siège sont séparées : deux prises collées ne feraient qu'un voyage. */
        for (const left of mine) {
          for (const right of mine) {
            if (left._id === right._id) continue;
            const gap = distanceKm(
              [left.point.lon, left.point.lat],
              [right.point.lon, right.point.lat],
            );
            if (gap < OBJECTIVE_SPREAD_KM) expect(gap).toBeGreaterThanOrEqual(OBJECTIVE_SPREAD_KM);
          }
        }
      }
    }, 60_000);

    /**
     * **Un océan entre deux quartiers généraux ne se traverse pas à pied** : la paire n'a pas
     * d'objectif dur, et la dépêche le dit à tout le monde plutôt que de se taire.
     */
    it('names the pair an ocean separates, and places no hard objective for it', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['japan', 'usa']);
      await place(t, seats[0]!);

      const placed = await objectivesIn(t);
      expect(
        placed.filter((objective) => objectiveArchetype(objective.key)!.tier === 'hard'),
      ).toHaveLength(0);
      expect(placed).toHaveLength(4);
      for (const seat of seats) {
        expect(await noticesOf(t, seat, 'objectiveGap')).toHaveLength(1);
        expect(await noticesOf(t, seat, 'objectiveRevealed')).toHaveLength(4);
      }
    }, 60_000);

    /** Le dur est un détour, et un détour **partagé** : les deux gardes se lisent sur la route. */
    it('puts the hard one at a shared distance from both headquarters', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'germany']);
      await place(t, seats[0]!);
      const hard = (await objectivesIn(t)).filter(
        (objective) => objectiveArchetype(objective.key)!.tier === 'hard',
      );
      if (hard.length === 0) return;

      const point = [hard[0]!.point.lon, hard[0]!.point.lat] as LonLat;
      const distances = (['france', 'germany'] as const).map((nation) => {
        const measured = routeKmFrom(
          pointOfRegion(capitalRegionOf(nation)),
          [{ id: 'target', point }],
          'land',
        );
        return measured.get('target')!;
      });
      const closer = Math.min(...distances);
      const farther = Math.max(...distances);
      expect(closer).toBeGreaterThanOrEqual(OBJECTIVE_HARD_MIN_KM);
      expect(closer).toBeGreaterThanOrEqual(OBJECTIVE_HARD_FAIRNESS * farther);
    }, 60_000);

    /** Reposer ne double rien : le travail est repris sans conséquence. */
    it('places once, however many times the job runs', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      await place(t, seats[0]!);
      const first = (await objectivesIn(t)).length;
      await place(t, seats[0]!);
      expect((await objectivesIn(t)).length).toBe(first);
    }, 60_000);

    /**
     * **C'est la base qui arbitre la seconde pose, pas l'appelant.** L'action lit avant de
     * mesurer et s'arrête là si la saison est servie ; mais deux actions parties ensemble ont
     * toutes deux lu une saison vide, et seule la transaction de `commit` les départage. Un test
     * qui ne passerait que par l'action ne prouverait donc pas l'idempotence.
     */
    it('writes nothing on a second commit, whatever the first one wrote', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      const seasonId = seats[0]!.seasonId;
      const placements = [{ key: 'abandonedStores', regionId: HAINAUT }];
      await t.mutation(internal.objectives.commit, { seasonId, placements, gaps: [] });
      const after = await objectivesIn(t);
      expect(after).toHaveLength(1);

      await t.mutation(internal.objectives.commit, {
        seasonId,
        placements: [{ key: 'fuelDump', regionId: 'BEL-3476' }],
        gaps: [{ left: 'x', right: 'y' }],
      });
      expect(await objectivesIn(t)).toHaveLength(1);
      expect((await objectivesIn(t))[0]!._id).toBe(after[0]!._id);
      /** Ni garnison de plus, ni siège irrégulier de plus, ni dépêche de plus. */
      const seatsHeld = await t.run(async (ctx) =>
        ctx.db
          .query('players')
          .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
          .collect(),
      );
      expect(seatsHeld.filter((held) => held.irregular === true)).toHaveLength(1);
      expect(await noticesOf(t, seats[0]!, 'objectiveRevealed')).toHaveLength(1);
      expect(await noticesOf(t, seats[0]!, 'objectiveGap')).toHaveLength(0);
    }, 60_000);

    it('purges them with the season it belongs to', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      await place(t, seats[0]!);
      expect((await objectivesIn(t)).length).toBeGreaterThan(0);

      await t.mutation(api.seasons.destroy, seats[0]!);
      expect(await objectivesIn(t)).toEqual([]);
    }, 60_000);
  });

  /**
   * **Le siège irrégulier n'est pas un joueur**, et c'est `seatsOf` qui le dit une fois pour
   * tout ce qui demande « qui joue ici ». Un filtre oublié le ferait entrer au classement, à la
   * presse, dans l'encre des cartes et dans le compte d'un doyen.
   */
  describe('the irregular seat', () => {
    it('appears in no roster, no ranking and no ledger', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      await place(t, seats[0]!);

      const irregular = await t.run(async (ctx) =>
        (
          await ctx.db
            .query('players')
            .withIndex('bySeason', (q) => q.eq('seasonId', seats[0]!.seasonId))
            .collect()
        ).find((seat) => seat.irregular === true),
      );
      expect(irregular).toBeDefined();

      const lobby = await t.query(api.seasons.lobby, seats[0]!);
      expect(lobby.players).toHaveLength(2);
      expect(await t.query(api.accounts.seats, { token: seats[0]!.token })).toHaveLength(1);

      const view = await t.query(api.view.playerView, seats[0]!);
      expect(view.season.reduction.standings).toHaveLength(2);
      expect(view.opponents).toHaveLength(1);
      /** Sa nation est `null`, donc elle n'en réserve aucune : le salon en offre toujours huit. */
      expect(irregular!.nation).toBeNull();
    }, 60_000);

    /** **Elle ne mange pas** : une garnison locale est posée pour la saison, sans ravitaillement. */
    it('is fed nothing by the upkeep', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      await plantObjective(t, seats[0]!, 'abandonedStores', HAINAUT);

      const irregularId = await t.run(
        async (ctx) =>
          (
            await ctx.db
              .query('players')
              .withIndex('bySeason', (q) => q.eq('seasonId', seats[0]!.seasonId))
              .collect()
          ).find((seat) => seat.irregular === true)!._id,
      );
      const upkeep = await t.run((ctx) =>
        import('./upkeep').then((module) => module.upkeepOf(ctx, irregularId, Date.now())),
      );
      expect(upkeep.foodPerHour).toBe(0);
      expect(upkeep.troops).toBe(0);
    }, 60_000);
  });

  describe('taking one', () => {
    /** Ce que la vue sert : un lieu, un archétype, un dépôt — et pas une troupe. */
    it('serves the objective to everybody, and its garrison to nobody', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      await plantObjective(t, seats[0]!, 'abandonedStores', HAINAUT);

      for (const seat of seats) {
        const view = await t.query(api.view.playerView, seat);
        expect(view.objectives).toHaveLength(1);
        const [objective] = view.objectives;
        expect(objective).toMatchObject({ key: 'abandonedStores', regionId: HAINAUT });
        expect(objective!.depot.alloy).toBe(60);
        expect(Object.keys(objective!)).not.toContain('garrison');
        /** La garnison n'est pas servie : elle se relève comme toute force posée, ou pas. */
        expect(view.camps).toHaveLength(0);
      }
    }, 60_000);

    it('refuses a column that carries no infantry, in the words the rose reads', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      const objectiveId = await plantObjective(t, seats[0]!, 'abandonedStores', HAINAUT);
      await placeHq(t, seats[0]!);
      const barracks = await raise(t, seats[0]!, 'barracks', MARNE);
      const armor = await form(t, seats[0]!, 'armor', barracks);

      await expect(
        t.mutation(api.movements.attack, {
          ...seats[0]!,
          origin: { kind: 'building', buildingId: barracks },
          troopIds: [armor],
          target: { kind: 'objective', objectiveId },
        }),
      ).rejects.toThrow(ConvexError);
    }, 60_000);

    /**
     * **Réduire, puis emporter.** Le dépôt ne part que si la garnison ne tient plus rien debout —
     * c'est la règle du combat telle qu'elle existe (ADR 0014, `winnerOf` : *dégager le terrain,
     * ou échouer*), et elle vaut ici exactement comme pour un raid. Huit compagnies contre deux,
     * donc : une supériorité, pas une visite — l'attaque ne vaut qu'en force, ce qui est déjà la
     * règle de l'assaut entre joueurs.
     */
    it('reduces the garrison, carries the depot home and empties the objective', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      const objectiveId = await plantObjective(t, seats[0]!, 'abandonedStores', HAINAUT);
      await placeHq(t, seats[0]!);
      const barracks = await raise(t, seats[0]!, 'barracks', MARNE);
      const column: Array<Id<'troops'>> = [];
      for (let rank = 0; rank < 8; rank += 1) {
        column.push(await form(t, seats[0]!, 'infantry', barracks));
      }

      await t.mutation(api.movements.attack, {
        ...seats[0]!,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: column,
        target: { kind: 'objective', objectiveId },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const objective = (await t.run((ctx) => ctx.db.get(objectiveId)))!;
      expect(objective.status).toBe('taken');
      expect(objective.depot.alloy).toBe(0);
      /** La capacité de la colonne dépasse les soixante d'alliage : rien ne reste au sol. */
      expect(
        carryCapacityOf(
          column.map(() => ({
            role: 'infantry' as const,
            strength: nominalStrength('infantry', 1),
            nominalStrength: nominalStrength('infantry', 1),
          })),
          CARRY_CAPACITY_BY_ROLE,
        ),
      ).toBeGreaterThan(60);
      /** Le dépôt vidé s'annonce à tout le monde, et ne nomme personne. */
      for (const seat of seats) {
        expect(await noticesOf(t, seat, 'objectiveTaken')).toHaveLength(1);
      }
    }, 60_000);

    /**
     * **Perdu, la garnison reste — moins ses pertes.** Deux compagnies contre un arsenal
     * retranché : la passe est perdue, le dépôt ne bouge pas, et le suivant trouve une garnison
     * entamée.
     */
    it('leaves the depot and a reduced garrison to the next one when the assault fails', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      const objectiveId = await plantObjective(t, seats[0]!, 'irregularArsenal', HAINAUT);
      await placeHq(t, seats[0]!);
      const barracks = await raise(t, seats[0]!, 'barracks', MARNE);
      const column = [await form(t, seats[0]!, 'infantry', barracks)];

      const garrisonBefore = await garrisonStrength(t, seats[0]!);
      await t.mutation(api.movements.attack, {
        ...seats[0]!,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: column,
        target: { kind: 'objective', objectiveId },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const objective = (await t.run((ctx) => ctx.db.get(objectiveId)))!;
      expect(objective.status).toBe('standing');
      expect(objective.depot.alloy).toBe(300);
      const garrisonAfter = await garrisonStrength(t, seats[0]!);
      expect(garrisonAfter).toBeGreaterThan(0);
      expect(garrisonAfter).toBeLessThan(garrisonBefore);
    }, 60_000);

    /** **Le reste reste au sol** : une colonne trop petite pour tout porter laisse le solde. */
    it('bounds what leaves by what the column carries, and leaves the rest standing', async () => {
      const t = boot();
      const seats = await launchedSeason(t, ['france', 'ussr']);
      const objectiveId = await plantObjective(t, seats[0]!, 'irregularArsenal', HAINAUT);
      /** La garnison retirée : ce cas mesure la charge, pas la passe. */
      await t.run(async (ctx) => {
        const irregular = (
          await ctx.db
            .query('players')
            .withIndex('bySeason', (q) => q.eq('seasonId', seats[0]!.seasonId))
            .collect()
        ).find((seat) => seat.irregular === true)!;
        for (const troop of await ctx.db
          .query('troops')
          .withIndex('byPlayer', (q) => q.eq('playerId', irregular._id))
          .collect()) {
          await ctx.db.delete(troop._id);
        }
      });
      await placeHq(t, seats[0]!);
      const barracks = await raise(t, seats[0]!, 'barracks', MARNE);
      const column = [await form(t, seats[0]!, 'infantry', barracks)];

      await t.mutation(api.movements.attack, {
        ...seats[0]!,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: column,
        target: { kind: 'objective', objectiveId },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const objective = (await t.run((ctx) => ctx.db.get(objectiveId)))!;
      const left = RESOURCES.reduce((sum, resource) => sum + objective.depot[resource], 0);
      expect(objective.status).toBe('standing');
      /** Une compagnie porte quarante : trois cent quatre-vingts moins quarante restent. */
      expect(left).toBeGreaterThan(0);
      expect(left).toBeLessThan(380);
    }, 60_000);
  });
});

/** Ce que la garnison locale tient debout, tous archétypes confondus. */
async function garrisonStrength(t: ReturnType<typeof boot>, seat: Seat): Promise<number> {
  return t.run(async (ctx) => {
    const irregular = (
      await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', seat.seasonId))
        .collect()
    ).find((candidate) => candidate.irregular === true);
    if (irregular === undefined) return 0;
    const held = await ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', irregular._id))
      .collect();
    return held.reduce((sum, troop) => sum + troop.currentStrength, 0);
  });
}
