/**
 * **Une Mondiale de bots jouée jusqu'à sa fin, en mémoire** (#652). Les bots de l'ADR 0042 jouent
 * par la porte d'un joueur (`pass`, `convex/bot.fixture.ts`) dans `convex-test`, où l'horloge est
 * celle de vitest : le temps de la saison saute d'un pas à l'autre au lieu de s'écouler. Aucune
 * règle ne change, aucune constante n'est réécrite, et rien ne part vers un backend.
 *
 * Ce fichier n'est pas un test : `npm run test` ne le voit pas (le projet `simulation` de
 * `vite.config.ts` n'existe que sous `BOTS_SERIE`). Il se lance par `npm run bots:serie`
 * (`scripts/bots-serie.mjs`), qui lui passe une partie par processus et range les sorties.
 *
 * Limite du pas : un travail planifié s'exécute à la fin du pas où tombe son échéance, donc avec
 * au plus `stepMinutes` de retard. Les bots, eux, jouent à leur cadence.
 */
import { writeFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { MONDIALE_TROOP_BOUND } from './constants';
import { boot, pass, type Bench } from './bot.fixture';
import { adaptServerView } from '../src/data/serverView';
import { joinSeat, signIn, type Seat } from './seats.fixture';
import { seasonReportOf, type ReportInput } from '../src/domain/season-report';
import { renderReport } from '../scripts/rapport-de-saison.mjs';

type Options = {
  readonly seed: number;
  readonly nations: ReadonlyArray<string>;
  /** Minutes de saison entre deux passages d'un même bot. */
  readonly cadenceMinutes: number;
  /** Minutes de saison entre deux réveils du planificateur. */
  readonly stepMinutes: number;
  readonly durationHours: number;
  /** Heures entre deux relevés de l'instant (tortue, escouade, charge). */
  readonly sampleHours: number;
  readonly out: string;
};

const options: Options = JSON.parse(process.env.BOTS_SERIE ?? '{}');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Pris avant les faux minuteurs, qui remplacent aussi `performance.now`. */
const wallNow = performance.now.bind(performance);

/** Park-Miller : la même graine rejoue la même partie, `Math.random` du serveur compris. */
const seeded = (seed: number) => {
  let state = seed % 2_147_483_647 || 1;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return (state - 1) / 2_147_483_646;
  };
};

beforeAll(() => {
  vi.useFakeTimers();
  // Un lancement à 6 h UTC : ni minuit ni l'heure ronde d'un fuseau, que rien ne favorise.
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 17, 6, 0, 0)));
  vi.spyOn(Math, 'random').mockImplementation(seeded(options.seed));
});
afterAll(() => vi.useRealTimers());

/** Le planificateur avance jusqu'à `target` par pas de `stepMinutes`, et finit ce qui tombe. */
async function advanceTo(t: Bench, target: number): Promise<void> {
  while (Date.now() < target) {
    vi.advanceTimersByTime(Math.min(options.stepMinutes * MINUTE, target - Date.now()));
    await t.finishInProgressScheduledFunctions();
  }
}

type Facts = Omit<ReportInput, 'outposts' | 'stepHours'> & { code: string };

const factsOf = (t: Bench, code: string) =>
  t.query(internal.seasonReport.facts, { code }) as Promise<Facts>;

async function journalOf(t: Bench, players: Facts['players']) {
  const outposts: ReportInput['outposts'][number][] = [];
  const assetUses: Record<string, number> = {};
  for (const { id, irregular } of players) {
    if (irregular === true) continue;
    let cursor: string | null = null;
    do {
      const page: { events: typeof outposts; uses: number; next: string | null } = await t.query(
        internal.seasonReport.outpostEvents,
        { playerId: id as Id<'players'>, cursor },
      );
      outposts.push(...page.events);
      assetUses[id] = (assetUses[id] ?? 0) + page.uses;
      cursor = page.next;
    } while (cursor !== null);
  }
  return { outposts, assetUses };
}

/** Ce que le rapport ne garde qu'à l'instant de la lecture, relevé à chaque `sampleHours`. */
type Sample = {
  readonly hour: number;
  readonly players: ReadonlyArray<{
    readonly playerId: string;
    readonly troops: number;
    readonly home: number;
    readonly largest: number;
    readonly load: number;
  }>;
};

function sampleOf(facts: Facts, hour: number): Sample {
  const report = seasonReportOf({ ...facts, outposts: [], stepHours: 24 });
  return {
    hour,
    players: report.troops.map((row) => ({
      playerId: row.playerId,
      troops: row.total,
      home: row.home,
      largest: report.squads.find((squad) => squad.playerId === row.playerId)?.largest ?? 0,
      load:
        (report.load.find((load) => load.playerId === row.playerId)?.pieces ?? 0) +
        (report.load.find((load) => load.playerId === row.playerId)?.queued ?? 0),
    })),
  };
}

it(
  'une Mondiale de bots va à sa fin',
  async () => {
    const t = boot();
    const tokens = [await signIn(t, 'Bot1')];
    const { code, seasonId } = await t.mutation(api.seasons.create, {
      token: tokens[0]!,
      compensation: 0,
      mode: 'mondiale',
    });
    await t.run((ctx) =>
      ctx.db.patch(seasonId, { seed: options.seed, durationHours: options.durationHours }),
    );
    const seats: Seat[] = [{ token: tokens[0]!, seasonId }];
    for (let k = 1; k < options.nations.length; k++)
      seats.push(await joinSeat(t, code, `Bot${k + 1}`));
    for (const [k, seat] of seats.entries()) {
      await t.mutation(api.players.reserveNation, {
        ...seat,
        nation: options.nations[k] as never,
      });
      await t.mutation(api.players.declareReady, { ...seat, ready: true });
    }
    await t.mutation(api.seasons.launch, seats[0]!);
    const launchedAt = Date.now();
    const end = launchedAt + options.durationHours * HOUR;

    const refused: string[] = [];
    const played: Record<string, number> = {};
    /** Ordres acceptés par jour de saison : une partie qui s'arrête de jouer se voit ici. */
    const playedByDay: number[] = [];
    /** Stock, débit horaire et plafond de chaque ressource, par nation, à chaque relevé. */
    const economy: Array<{
      hour: number;
      nations: Record<string, Record<string, number[]>>;
      sites?: Record<string, string[]>;
      lorries?: Record<string, number>;
    }> = [];
    const samples: Sample[] = [];
    const startedAt = wallNow();
    let nextSample = launchedAt;
    let passes = 0;
    const status = () => t.run(async (ctx) => (await ctx.db.get(seasonId))!);

    while ((await status()).status === 'launched' && Date.now() <= end + HOUR) {
      if (Date.now() >= nextSample) {
        const hour = (Date.now() - launchedAt) / HOUR;
        samples.push(sampleOf(await factsOf(t, code), hour));
        const nations: Record<string, Record<string, number[]>> = {};
        /** Les bâtiments de chaque nation : clé, niveau, et le tas qui attend son camion (ADR 0041). */
        const sites: Record<string, string[]> = {};
        const lorries: Record<string, number> = {};
        for (const [k, seat] of seats.entries()) {
          try {
            const { me } = adaptServerView(await t.query(api.view.playerView, seat));
            sites[options.nations[k]!] = me.buildings.map(
              (b) =>
                `${b.key}${b.level}${b.heap === undefined ? '' : `:${b.heap.resource}=${Math.round(b.heap.amount)}`}`,
            );
            lorries[options.nations[k]!] = me.troops.filter(
              (troop) => troop.role === 'landTransport',
            ).length;
            nations[options.nations[k]!] = Object.fromEntries(
              Object.entries(me.resources).map(([key, r]) => [
                key,
                [Math.round(r.stock), Math.round(r.ratePerHour * 10) / 10, r.cap],
              ]),
            );
          } catch {
            // une place défaite ne lit plus sa vue
          }
        }
        economy.push({ hour, nations, sites, lorries });
        nextSample += options.sampleHours * HOUR;
      }
      for (const [k, seat] of seats.entries()) {
        const fns: string[] = [];
        try {
          await pass(t, seat, refused, fns);
        } catch (error) {
          // Une place défaite ne lit plus sa vue : elle ne joue plus.
          if (!String(error).includes('DEFEATED')) refused.push(`Bot${k + 1} : ${String(error)}`);
        }
        for (const fn of fns) played[fn] = (played[fn] ?? 0) + 1;
        const day = Math.floor((Date.now() - launchedAt) / (24 * HOUR));
        playedByDay[day] = (playedByDay[day] ?? 0) + fns.length;
      }
      passes += 1;
      if (passes % 24 === 0)
        process.stderr.write(
          `[bots-serie] ${options.seed} : ${Math.round((Date.now() - launchedAt) / HOUR)} h de saison, ${Math.round((wallNow() - startedAt) / 1000)} s réelles\n`,
        );
      await advanceTo(t, Date.now() + options.cadenceMinutes * MINUTE);
    }
    // La chaîne de clôture (édition finale, archive) tourne après la conclusion.
    await advanceTo(t, Date.now() + HOUR);

    const season = await status();
    const facts = await factsOf(t, code);
    const journal = await journalOf(t, facts.players);
    const report = seasonReportOf({ ...facts, stepHours: 24, ...journal });
    const markdown = renderReport({
      code,
      launchedAt: facts.launchedAt,
      now: facts.now,
      players: [...facts.players],
      report,
    });
    const nationOf = new Map(facts.players.map((player) => [player.id, player.nation]));
    /** Les Sept : qui les tient à la fin, et combien d'heures chacun y a tenues (M12). */
    const points = await t.run(async (ctx) =>
      (
        await ctx.db
          .query('strategicPoints')
          .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
          .collect()
      ).map((point) => ({
        key: point.key,
        holder: point.holderId === null ? null : (nationOf.get(point.holderId) ?? null),
        hands: (point.hands ?? []).length,
        // Ce que le teneur tient encore court depuis `heldSince` (`heldMsOn`, convex/strategicPoints.ts).
        heldHours: Object.fromEntries(
          Object.entries({
            ...point.heldMs,
            ...(point.holderId === null || point.heldSince === null
              ? {}
              : {
                  [point.holderId]:
                    (point.heldMs?.[point.holderId] ?? 0) + facts.now - point.heldSince,
                }),
          } as Record<string, number>).map(([id, ms]) => [nationOf.get(id) ?? id, ms / HOUR]),
        ),
      })),
    );
    const summary = {
      seed: options.seed,
      nations: options.nations,
      cadenceMinutes: options.cadenceMinutes,
      durationHours: options.durationHours,
      status: season.status,
      winnerNation: season.winnerNation ?? null,
      reason: season.verdict?.reason ?? null,
      endedAtHour:
        season.concludedAt === undefined || season.concludedAt === null
          ? null
          : (season.concludedAt - launchedAt) / HOUR,
      passes,
      wallSeconds: Math.round((wallNow() - startedAt) / 1000),
      played,
      playedByDay: Array.from(playedByDay, (count) => count ?? 0),
      refused,
      bound: MONDIALE_TROOP_BOUND,
      outposts: report.outposts.map((row) => ({
        nation: nationOf.get(row.playerId) ?? null,
        founded: row.founded,
        raised: row.raised,
        peak: row.peak,
        standing: row.series.at(-1) ?? 0,
      })),
      isolation: report.isolation,
      points,
      lastEdition: facts.players
        .filter((player) => player.irregular !== true)
        .map((player) => {
          const last = facts.editions
            .filter((edition) => edition.playerId === player.id)
            .sort((a, b) => a.at - b.at)
            .at(-1);
          return {
            nation: player.nation,
            territory: last?.territory ?? 0,
            industry: last?.industry ?? 0,
            military: last?.military ?? 0,
          };
        }),
      economy,
      samples: samples.map((sample) => ({
        hour: sample.hour,
        players: sample.players.map(({ playerId, ...row }) => ({
          nation: nationOf.get(playerId) ?? null,
          ...row,
        })),
      })),
    };
    writeFileSync(
      `${options.out}.md`,
      `${markdown}\n${samplesOf(summary.samples)}\n${stocksOf(economy)}`,
    );
    writeFileSync(`${options.out}.json`, `${JSON.stringify(summary, null, 2)}\n`);
    expect(season.status).toBe('concluded');
  },
  24 * 3_600_000,
);

/** Les relevés de l'instant mis bout à bout : la série que le rapport seul ne garde pas. */
function samplesOf(
  samples: ReadonlyArray<{
    hour: number;
    players: ReadonlyArray<{
      nation: string | null;
      troops: number;
      home: number;
      largest: number;
      load: number;
    }>;
  }>,
): string {
  const nations = samples[0]?.players.map((player) => player.nation ?? '—') ?? [];
  const row = (pick: (player: (typeof samples)[number]['players'][number]) => string) =>
    samples.map(
      (sample) => `| ${Math.round(sample.hour)} h | ${sample.players.map(pick).join(' | ')} |`,
    );
  const head = [
    `| Heure | ${nations.join(' | ')} |`,
    `|---|${nations.map(() => '---').join('|')}|`,
  ];
  return (
    [
      '## 9. Relevés de la série',
      `Tortue, escouade et charge, relevées toutes les ${options.sampleHours} h de saison par la simulation (#652).`,
      '### Troupes (dont chez soi)',
      [...head, ...row((p) => `${p.troops} (${p.home})`)].join('\n'),
      '### Plus grosse escouade',
      [...head, ...row((p) => String(p.largest))].join('\n'),
      `### Charge (pièces + file, borne ${MONDIALE_TROOP_BOUND})`,
      [...head, ...row((p) => String(p.load))].join('\n'),
    ].join('\n\n') + '\n'
  );
}

/** Vivres et acier de chaque nation à chaque relevé : stock (débit horaire) / plafond. */
function stocksOf(
  economy: ReadonlyArray<{ hour: number; nations: Record<string, Record<string, number[]>> }>,
): string {
  const nations = options.nations;
  const head = [
    `| Heure | ${nations.join(' | ')} |`,
    `|---|${nations.map(() => '---').join('|')}|`,
  ];
  const table = (key: string) =>
    [
      ...head,
      ...economy.map(({ hour, nations: at }) => {
        const cell = (nation: string) => {
          const [stock, rate, cap] = at[nation]?.[key] ?? [];
          return stock === undefined ? '—' : `${stock} (${rate}/h) / ${cap}`;
        };
        return `| ${Math.round(hour)} h | ${nations.map(cell).join(' | ')} |`;
      }),
    ].join('\n');
  return (
    [
      '## 10. Stocks',
      'Stock (débit horaire) / plafond, à chaque relevé. Une famine (vivres à zéro, débit négatif) suspend les captures (ADR 0044).',
      '### Vivres',
      table('food'),
      '### Acier',
      table('steel'),
    ].join('\n\n') + '\n'
  );
}
