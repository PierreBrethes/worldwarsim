import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { NOTICES_SERVED, REPORTS_SERVED } from '../src/domain/player-view';
import { buildGrid } from '../src/domain/routing';
import { nominalStrength } from './constants';
import { specializationServed, specializationsServed } from './movement/forces';
import type { LonLat } from '../src/domain/geo';
import { outpostReachKm } from './constants';
import { heldOver } from './holding';
import { regionsWithinReach } from './regionGeometry';
import { allRegions, regionFacts, pointOfRegion } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { surveyRegion, foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Le plateau se recharge à chaque pas d'une colonne, et `playerView` n'a longtemps eu aucune
 * borne.** Les deux tables qu'une saison écrit sans fin — les comptes rendus de passe et les
 * dépêches — étaient relues entières à chaque chargement, le détail frappe par frappe compris :
 * mesuré à trois cents passes, l'appel relisait une dizaine de mégaoctets et franchissait le
 * plafond de lecture de Convex (8 Mio). Une saison longue ne rendait pas le jeu lent, elle le
 * rendait **illisible**, d'un seul coup et sans avertissement.
 *
 * Le banc qui l'a mesuré vit ici plutôt qu'à côté : un budget qu'aucun test ne tient se reperd au
 * premier champ ajouté. Les seuils sont **larges** et ne mesurent rien du jeu — ils sont là pour
 * tomber sur un ordre de grandeur, jamais sur un octet.
 *
 * Mesure du jour, sur la saison que ce fichier écrit : **76 ko servis** quand la base en tient
 * 2,5 Mo de comptes rendus, de frappes et de dépêches. C'est le rapport, pas le chiffre, qui est
 * la garantie : la vue ne grandit plus avec l'âge de la saison.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310'; // le sol de personne, 1 800 km à l'est
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

/** La saison écrite par le banc : bien au-delà de ce qu'une partie de 48 heures produit, pour que
 *  ce soit la fenêtre servie et non la brièveté de la saison qui tienne le budget. */
const PASSES = 300;
const DISPATCHES = 400;
const STRIKES_PER_PASS = 12;
const TROOPS_PER_PASS = 24;

/** Ce que la vue a le droit de peser sur le fil, à cette saison-là. */
const VIEW_BYTES = 512 * 1024;

/**
 * **Documents servis, toutes listes confondues** — et c'est le seuil qui compte, parce que pour
 * les deux tables sans fin, servir et relire sont la même chose : `engagementsOf` et la requête
 * des dépêches lisent exactement ce qu'elles rendent. Une liste qui croît avec l'âge de la saison
 * tombe ici, et nulle part ailleurs — le fil, lui, resterait léger longtemps après que la lecture
 * a franchi le plafond.
 */
const VIEW_DOCS = 400;

/**
 * **Les octets relus, et non ceux servis** : la profondeur des deux fenêtres multipliée par le
 * poids du document le plus lourd qu'elles couvrent. C'est ce produit que le plafond de Convex
 * (8 Mio) arbitre, et c'est lui qui a sauté à trois cents passes le détail frappe par frappe
 * gardé dans le compte rendu. Un mégaoctet laisse la marge d'un facteur huit.
 */
const READ_BYTES = 1024 * 1024;

/** Ce qu'un compte rendu pèse une fois le détail sorti de son document — c'est ce chiffre-là,
 *  multiplié par la profondeur de la fenêtre, que la vue relit. Mesuré à 4 ko pour une passe à
 *  vingt-quatre pions ; le même document avec ses frappes dedans en pesait le double. */
const REPORT_BYTES = 6 * 1024;

const bytes = (value: unknown): number => JSON.stringify(value)!.length;

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
}

/**
 * **Une saison vieille, écrite à la main.** Les mutations du jeu ne peuvent pas produire trois
 * cents passes en un test ; ce qui compte ici n'est pas comment les lignes sont nées mais combien
 * il y en a, et qu'aucune ne parte de la vue sans fenêtre.
 */
async function ageSeason(t: ReturnType<typeof boot>, seat: Seat) {
  await t.run(async (ctx) => {
    const me = await seatIn(ctx, seat);
    const foe = (
      await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', me.seasonId))
        .collect()
    ).find((seat) => seat._id !== me._id)!;
    const point = regionFacts(MARNE)!.point;

    const troop = async (playerId: Id<'players'>) =>
      ctx.db.insert('troops', {
        seasonId: me.seasonId,
        playerId,
        role: 'infantry' as const,
        tier: 1 as const,
        nominalStrength: 50,
        currentStrength: 50,
        stationedAt: null,
      });
    const mine = await troop(me._id);
    const theirs = await troop(foe._id);

    for (let pass = 0; pass < PASSES; pass += 1) {
      const iAttack = pass % 2 === 0;
      const engagementId = await ctx.db.insert('engagements', {
        seasonId: me.seasonId,
        attackerId: iAttack ? me._id : foe._id,
        defenderId: iAttack ? foe._id : me._id,
        cause: 'arrival' as const,
        point: { lon: point[0], lat: point[1] },
        hostCountry: 'France',
        at: MIDDAY.getTime() + pass * 60_000,
        winner: 'attacker' as const,
        outpostId: null,
        disabledUntil: null,
        troops: Array.from({ length: TROOPS_PER_PASS }, (_, index) => ({
          troopId: index % 2 === 0 ? mine : theirs,
          side: (index % 2 === 0 ? 'attacker' : 'defender') as 'attacker' | 'defender',
          role: 'infantry' as const,
          tier: 1 as const,
          strengthBefore: 50,
          strengthAfter: 34,
          state: 'standing' as const,
        })),
      });
      for (let rank = 0; rank < STRIKES_PER_PASS; rank += 1) {
        await ctx.db.insert('strikes', {
          engagementId,
          rank,
          phase: (rank % 2 === 0 ? 'strike' : 'riposte') as 'strike' | 'riposte',
          by: mine,
          byRole: 'infantry' as const,
          byTier: 1 as const,
          bySide: 'attacker' as const,
          target: theirs,
          targetRole: 'infantry' as const,
          targetTier: 1 as const,
          losses: 8,
        });
      }
    }

    for (let dispatch = 0; dispatch < DISPATCHES; dispatch += 1) {
      await ctx.db.insert('notices', {
        playerId: me._id,
        at: MIDDAY.getTime() - (DISPATCHES - 1 - dispatch) * 60_000,
        kind: 'columnArrived' as const,
        movementType: 'march' as const,
        hostCountry: 'France',
        troops: 3,
      });
    }
  });
}

describe('la vue du plateau tient dans un budget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('sert une fenêtre de la saison, jamais la saison', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await ageSeason(t, seat);

    const view = await t.query(api.view.playerView, seat);

    expect(view.reports).toHaveLength(REPORTS_SERVED);
    expect(view.notices).toHaveLength(NOTICES_SERVED);
    // La fenêtre est prise sur le récent : la dernière passe écrite est la première servie.
    expect(view.reports[0]!.at).toBe(MIDDAY.getTime() + (PASSES - 1) * 60_000);
    expect(view.notices[0]!.at).toBe(MIDDAY.getTime());
  });

  it('ne relit pas les anciens relevés sans inventaire d’installations', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await t.run(async (ctx) => {
      const me = await seatIn(ctx, seat);
      for (let index = 0; index < 500; index += 1) {
        await ctx.db.insert('regionSightings', {
          playerId: me._id,
          regionId: `legacy-${index}`,
          ownerId: null,
          seenAt: MIDDAY.getTime(),
        });
      }
    });

    const view = await t.query(api.view.playerView, seat);

    expect(view.surveyedInstallations).toEqual([]);
    expect(bytes(view)).toBeLessThan(VIEW_BYTES);
  });

  it('pèse un ordre de grandeur sous le plafond de lecture, en octets comme en documents', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await ageSeason(t, seat);

    const view = await t.query(api.view.playerView, seat);

    const served =
      view.reports.length +
      view.notices.length +
      view.movements.length +
      view.detected.length +
      view.me.troops.length +
      view.me.buildings.length;
    expect(bytes(view)).toBeLessThan(VIEW_BYTES);
    expect(served).toBeLessThan(VIEW_DOCS);
  });

  it('ne relit pas le détail frappe par frappe pour afficher deux totaux', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await ageSeason(t, seat);

    const written = await t.run(async (ctx) => ({
      passes: (await ctx.db.query('engagements').collect()).map(bytes),
      dispatches: (await ctx.db.query('notices').collect()).map(bytes),
      strikes: (await ctx.db.query('strikes').collect()).length,
    }));

    // Le détail existe, entier : il est la matière du rejeu (surface 4.7), rangé hors du compte
    // rendu et lu un engagement à la fois.
    expect(written.strikes).toBe(PASSES * STRIKES_PER_PASS);
    expect(Math.max(...written.passes)).toBeLessThan(REPORT_BYTES);

    /** Le pire cas de la lecture : chaque fenêtre remplie de son document le plus lourd. */
    const read =
      REPORTS_SERVED * Math.max(...written.passes) +
      NOTICES_SERVED * Math.max(...written.dispatches);
    expect(read).toBeLessThan(READ_BYTES);
  });

  it('répond des métiers scellés en une lecture, et la même chose qu’une par point', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);

    const answers = await t.run(async (ctx) => {
      const me = await seatIn(ctx, seat);
      const point = regionFacts(MARNE)!.point;
      for (let index = 0; index < 12; index += 1) {
        await ctx.db.insert('outposts', {
          seasonId: me.seasonId,
          playerId: me._id,
          point: { lon: point[0] + index, lat: point[1] },
          hostCountry: 'France',
          level: 1,
          specialization: 'relay' as const,
          foundedAt: MIDDAY.getTime(),
          disabledUntil: null,
          immuneUntil: null,
        });
      }
      const outposts = await ctx.db
        .query('outposts')
        .withIndex('byPlayer', (q) => q.eq('playerId', me._id))
        .collect();
      await ctx.db.insert('movements', {
        seasonId: me.seasonId,
        playerId: me._id,
        type: 'march' as const,
        fromBuildingId: null,
        target: { kind: 'point' as const, point: { lon: point[0] + 3, lat: point[1] } },
        from: { lon: point[0], lat: point[1] },
        to: { lon: point[0] + 3, lat: point[1] },
        hostCountry: 'France',
        points: [
          { lon: point[0] + 3, lat: point[1] },
          { lon: point[0] + 4, lat: point[1] },
        ],
        legs: [{ medium: 'land' as const, distanceUnits: 100 }],
        distanceUnits: 100,
        costUnits: 160,
        troopIds: [],
        departedAt: MIDDAY.getTime() + 60_000,
        arrivesAt: MIDDAY.getTime() + 3_600_000,
      });

      const bulk = await specializationsServed(ctx, me.seasonId, outposts);
      const one = new Map<string, boolean>();
      for (const outpost of outposts) {
        one.set(outpost._id, await specializationServed(ctx, outpost));
      }
      return outposts.map((outpost) => [bulk.has(outpost._id), one.get(outpost._id)!] as const);
    });

    expect(answers.every(([bulk, one]) => bulk === one)).toBe(true);
    // Et la question a une réponse des deux côtés : un point servi, les autres non.
    expect(answers.filter(([bulk]) => bulk)).not.toHaveLength(0);
    expect(answers.filter(([bulk]) => !bulk)).not.toHaveLength(0);
  });
});

/**
 * **Une query n'a qu'une seconde, et la rasterisation du monde la dépassait.** La vue lit
 * `afloat` et `coastal` sur la grille de routage pour chaque pile posée sur un point, et cette
 * grille se construisait à la première demande de l'isolat : 1,33 M de cellules tirées des
 * polygones de pays, 31 ms à chaud sur une machine de développement, des secondes à froid sans
 * JIT. D'où les « Function execution timed out » **par intermittence** sur `view:playerView` —
 * le premier appel d'un isolat neuf payait le raster, le second passait.
 *
 * La grille est cuite depuis (`public/grid.json`, décodée par `convex/routes.ts`) et cet espion
 * est ce qui l'empêche de revenir : `buildGrid` est la référence hors ligne, elle n'a plus rien à
 * faire dans le chemin d'une query. Le même budget porte `movements.preview`.
 */
vi.mock('../src/domain/routing', { spy: true });

describe('aucune query ne rasterise le monde', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('sert la vue et l’aperçu sur la grille cuite', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(MARNE)!.point;

    const { barracks, marching } = await t.run(async (ctx) => {
      const me = await seatIn(ctx, seat);
      const barracks = await ctx.db.insert('buildings', {
        seasonId: me.seasonId,
        playerId: me._id,
        key: 'barracks' as const,
        regionId: MARNE,
        point: pointOfRegion(MARNE),
        level: 1,
      });
      const troop = async (stationedAt: Id<'buildings'> | { lon: number; lat: number }) =>
        ctx.db.insert('troops', {
          seasonId: me.seasonId,
          playerId: me._id,
          role: 'infantry' as const,
          tier: 1 as const,
          nominalStrength: nominalStrength('infantry', 1),
          currentStrength: nominalStrength('infantry', 1),
          stationedAt,
        });
      // Une pile posée sur un point : c'est elle qui fait lire la grille à la vue.
      await troop({ lon: point[0], lat: point[1] });
      return { barracks, marching: await troop(barracks) };
    });

    /** Depuis l'ADR 0024 §4 un assaut vise un relevé : sans lui l'aperçu répond `null`, et
     *  l'espion n'aurait plus rien à surveiller. */
    await surveyRegion(t, seat, PRAHOVA);
    vi.mocked(buildGrid).mockClear();

    const view = await t.query(api.view.playerView, seat);
    const preview = await t.query(api.movements.preview, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [marching],
      target: { kind: 'region', regionId: PRAHOVA },
      type: 'attack',
    });

    // Les deux lectures ont bien eu lieu : sans elles, l'espion serait muet pour rien.
    expect(view.me.troops.some((troop) => troop.stationedAt.kind === 'point')).toBe(true);
    expect(preview?.route.points.length).toBeGreaterThan(1);

    expect(
      vi.mocked(buildGrid),
      `buildGrid est appelée dans une query : la grille doit venir de public/grid.json, décodée par convex/routes.ts.`,
    ).not.toHaveBeenCalled();
  });
});

/**
 * **La couleur se mesure par point, pas par région** (révision du 17/09/2026 de l'ADR 0020 §1).
 * Le pôle était une distance par région : 4 589 comparaisons, et c'est tout. Le disque parcourt
 * des cellules, et s'il était payé par région le classement dépouillerait le monde une fois par
 * ligne. Il est payé par **point** — la boîte englobante d'un rayon, quelques milliers de cellules
 * — et **mémoïsé** par l'isolat : la couverture d'un avant-poste ne change qu'à son élévation, et
 * `heldOver` est appelée plusieurs fois dans une même requête (la vue, la production, le relevé).
 *
 * Le seuil est large et ne mesure rien du jeu : une query n'a qu'une seconde, et ce qui est
 * vérifié ici est un ordre de grandeur — huit points de niveau 3 sur les 4 589 régions cuites.
 */
describe('la couleur se mesure par point et se retient', () => {
  const FAR_APART: ReadonlyArray<LonLat> = [
    [-111.38, 56.73],
    [-75.7, 45.5],
    [-51.5, -26.6],
    [8.15, 36.72],
    [25.45, 45.7],
    [100, 65],
    [135, -25],
    [14.45, 35.9],
  ];

  it('rend la même couverture sans la recalculer, et tient le budget d’une query', () => {
    const level3 = outpostReachKm(3);

    const first = performance.now();
    const covers = FAR_APART.map((point) => regionsWithinReach(point, level3));
    const measured = performance.now() - first;

    const second = performance.now();
    const again = FAR_APART.map((point) => regionsWithinReach(point, level3));
    const remembered = performance.now() - second;

    /** Le mémo rend **l'objet même**, ce qu'aucun chronomètre n'a besoin d'arbitrer : recalculer
     *  donnerait une seconde carte, égale et distincte. */
    expect(again.every((map, rank) => map === covers[rank])).toBe(true);
    expect(covers.every((map) => map.size > 0)).toBe(true);
    expect(measured).toBeLessThan(500);
    expect(remembered).toBeLessThan(measured + 1);
  });

  it('colore les 4 589 régions cuites depuis huit points en une passe', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await t.run(async (ctx) => {
      const me = await seatIn(ctx, seat);
      for (const [lon, lat] of FAR_APART) {
        await ctx.db.insert('outposts', {
          seasonId: me.seasonId,
          playerId: me._id,
          point: { lon, lat },
          hostCountry: 'XXX',
          level: 3,
          specialization: 'relay' as const,
          foundedAt: MIDDAY.getTime(),
          disabledUntil: null,
          immuneUntil: null,
        });
      }
    });

    const started = performance.now();
    /** La carte elle-même ne traverse pas la frontière d'une mutation — son compte suffit, et
     *  c'est le temps qui est sous test. */
    const coloured = await t.run(async (ctx) => {
      const me = await seatIn(ctx, seat);
      return (await heldOver(ctx, me.seasonId, allRegions(), Date.now())).size;
    });
    expect(performance.now() - started).toBeLessThan(500);
    expect(coloured).toBeGreaterThan(0);
  });
});
