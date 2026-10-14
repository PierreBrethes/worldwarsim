import { v, type Infer } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import {
  gameCode,
  joinRefusalOf,
  normalizeGameCode,
  playableRegion,
  registrationDeadline,
} from '../src/domain/off-season';
import { NATIONS, RESOURCES } from '../src/domain/ids';
import { isNation } from '../src/domain/nations';
import { fail } from './errors';
import {
  accountOf,
  everySeatOf,
  isAtWar,
  playerOf,
  requirePlayable,
  seatOf,
  seatsOf,
} from './seats';
import { notifyPlayer } from './notifications';
import { journalUrl, push } from '../src/domain/push';
import { publishFinalEdition } from './press';
import { SEASON_MODE, VERDICT } from './validators';
import { MODE_RULES, modeOf, seatRangeOf, type SeasonMode } from '../src/domain/season-mode';
import {
  REMINDER_MINUTES,
  THEATRE_DRAW,
  drawTheatre,
  launchPlanOf,
  seatCapOf,
  settingsRefusalOf,
  type Settings,
} from '../src/domain/operation-order';
import {
  DEFAULT_REST_WINDOW,
  FOUNDER_ABSENCE_HOURS,
  PRESS_EDITION_HOURS,
  STARTING_KIT,
} from './constants';

/**
 * **Le kit, et rien d'autre** — remis une fois, par les deux seules routes qui mènent à un
 * plateau : le lancement, pour tout le monde au salon, et l'entrée en guerre, pour qui arrive
 * après. Une seule écriture de la dotation, pour qu'un changement ne puisse pas atteindre une
 * route et manquer l'autre.
 *
 * **Rien n'est planté ici** (décision 1b du 13/09, révision des ADR 0015 et 0017 §2). Le quartier
 * général était posé d'office sur la capitale de 1940, et la compagnie d'infanterie avec lui ;
 * les deux sont passés dans le socle, que le joueur acquitte où il veut sur son sol
 * (`constructions.start`). Ce qui l'a rouvert : une bâtisse par région, donc un gisement sous le
 * QG est un gisement perdu — c'est au joueur de choisir ce qu'il sacrifie.
 *
 * Un belligérant qui n'a encore rien debout est donc un état normal, et le premier de la saison.
 */
async function endow(
  ctx: MutationCtx,
  player: Doc<'players'>,
  season: Doc<'seasons'>,
  at: number,
): Promise<void> {
  if (!isNation(player.nation)) fail('UNKNOWN_NATION', { nickname: player.nickname });
  /** **La Blitz ne tient aucune des huit** : ses lignes existent à zéro, parce que tout ce qui
   *  règle une économie les relit, et ses fonds viennent avec la carte (`blitz.commit`). */
  const blitz = modeOf(season.mode) === 'blitz';
  for (const key of RESOURCES) {
    await ctx.db.insert('resources', {
      playerId: player._id,
      key,
      stock: blitz ? 0 : STARTING_KIT[key],
      updatedAt: at,
    });
  }

  await ctx.db.patch(player._id, { enteredWarAt: at });
}

const settingsOf = (season: Doc<'seasons'>): Settings => ({
  mode: modeOf(season.mode),
  theatre: season.theatre ?? null,
  scheduledAt: season.scheduledAt ?? null,
  remind: season.remind ?? null,
  hqCaptureHours: season.hqCaptureHours ?? null,
  seatCap: season.seatCap ?? null,
});

const maximumOf = (season: Doc<'seasons'>): number => seatCapOf(settingsOf(season));

/** Ce que l'ordre d'opérations sert aux écrans, défauts compris. */
const ordersOf = (season: Doc<'seasons'>) => ({
  scheduledAt: season.scheduledAt ?? null,
  remind: season.remind ?? null,
  hqCaptureHours: season.hqCaptureHours ?? null,
  seatCap: season.seatCap ?? null,
});

const SETTINGS_ARGS = {
  theatre: v.optional(v.string()),
  scheduledAt: v.optional(v.union(v.number(), v.null())),
  remind: v.optional(v.boolean()),
  hqCaptureHours: v.optional(v.number()),
  seatCap: v.optional(v.number()),
};

/** **Le rappel quinze minutes avant le rendez-vous** : un seul travail par saison. Tout
 *  changement de l'ordre annule le précédent et replanifie ; `remind` se relit encore à
 *  l'échéance, au cas où. */
async function planReminder(ctx: MutationCtx, season: Doc<'seasons'>): Promise<void> {
  if (season.reminderJobId !== undefined) {
    const job = await ctx.db.system.get(season.reminderJobId);
    if (job !== null && job.state.kind === 'pending') await ctx.scheduler.cancel(job._id);
  }
  const settings = settingsOf(season);
  const at =
    settings.mode === 'blitz' && settings.scheduledAt !== null && settings.remind === true
      ? settings.scheduledAt - REMINDER_MINUTES * 60_000
      : null;
  const reminderJobId =
    at === null || at <= Date.now()
      ? undefined
      : await ctx.scheduler.runAt(at, internal.seasons.remind, {
          seasonId: season._id,
          expectedAt: settings.scheduledAt!,
        });
  await ctx.db.patch(season._id, { reminderJobId });
}

export const remind = internalMutation({
  args: { seasonId: v.id('seasons'), expectedAt: v.number() },
  handler: async (ctx, { seasonId, expectedAt }) => {
    const season = await ctx.db.get(seasonId);
    if (season === null || season.status !== 'lobby') return;
    if (season.scheduledAt !== expectedAt || season.remind !== true) return;
    for (const entry of await seatsOf(ctx, seasonId)) {
      await notifyPlayer(ctx, entry._id, {
        type: 'season',
        phrase: push.rendezvousSoon(REMINDER_MINUTES),
        url: '/accueil',
        at: Date.now(),
      });
    }
  },
});

/**
 * **Un seul choix : le mode** (lot 1 de la Blitz, 14/10/2026). Il fixe l'horloge, le plafond de
 * joueurs et, en Blitz, le théâtre — le fondateur ne règle plus l'horloge. Le format est parti le
 * 31/08 (ADR 0020 §11) ; les saisons sans horloge d'avant se lisent toujours.
 */
export const create = mutation({
  args: {
    token: v.string(),
    compensation: v.number(),
    mode: SEASON_MODE,
    ...SETTINGS_ARGS,
  },
  handler: async (ctx, { token, compensation, mode, theatre, ...orders }) => {
    const account = await accountOf(ctx, token);
    if (!account) fail('UNKNOWN_SESSION');
    const settings = settingsFrom(mode, theatre, orders);
    const refusal = settingsRefusalOf(settings, {
      seated: 1,
      now: Date.now(),
      rendezvousChanged: true,
    });
    if (refusal !== null) fail(refusal);
    const code = await freeCode(ctx);
    const seasonId = await ctx.db.insert('seasons', {
      code,
      status: 'lobby',
      durationHours: MODE_RULES[mode].clockHours,
      mode,
      ...(mode === 'blitz' ? { theatre } : {}),
      ...stored(settings),
      compensation: Math.max(0, Math.min(1, compensation)),
      seed: Math.floor(Math.random() * 2 ** 31),
      playableRegion: null,
      launchedAt: null,
      winnerId: null,
      winnerNation: null,
      concludedAt: null,
      playerCount: 0,
    });
    await seat(ctx, account, seasonId, true);
    const season = await ctx.db.get(seasonId);
    if (season !== null) await planReminder(ctx, season);
    return { code, seasonId };
  },
});

type Orders = {
  readonly scheduledAt?: number | null | undefined;
  readonly remind?: boolean | undefined;
  readonly hqCaptureHours?: number | undefined;
  readonly seatCap?: number | undefined;
};

const settingsFrom = (mode: SeasonMode, theatre: string | undefined, orders: Orders): Settings => ({
  mode,
  theatre: theatre ?? null,
  scheduledAt: orders.scheduledAt ?? null,
  remind: orders.remind ?? null,
  hqCaptureHours: orders.hqCaptureHours ?? null,
  seatCap: orders.seatCap ?? null,
});

const stored = (settings: Settings) => ({
  ...(settings.scheduledAt === null ? {} : { scheduledAt: settings.scheduledAt }),
  ...(settings.remind === null ? {} : { remind: settings.remind }),
  ...(settings.hqCaptureHours === null ? {} : { hqCaptureHours: settings.hqCaptureHours }),
  ...(settings.seatCap === null ? {} : { seatCap: settings.seatCap }),
});

/**
 * **Le fondateur reprend l'ordre au salon** (choix 8, 9, 10, M15), jusqu'au lancement. Ne change
 * que ce qui est nommé ; `scheduledAt: null` dit « dès que la table est complète ». **Toute
 * modification lève les « prêt »** : on ne tamponne pas un ordre qui a changé depuis.
 */
export const configure = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), ...SETTINGS_ARGS },
  handler: async (ctx, { token, seasonId, ...changes }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (!player.creator) fail('CREATOR_ONLY');
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
    const current = settingsOf(season);
    const next: Settings = {
      ...current,
      ...(changes.theatre === undefined ? {} : { theatre: changes.theatre }),
      ...(changes.scheduledAt === undefined ? {} : { scheduledAt: changes.scheduledAt }),
      ...(changes.remind === undefined ? {} : { remind: changes.remind }),
      ...(changes.hqCaptureHours === undefined ? {} : { hqCaptureHours: changes.hqCaptureHours }),
      ...(changes.seatCap === undefined ? {} : { seatCap: changes.seatCap }),
    };
    const present = await seatsOf(ctx, season._id);
    const refusal = settingsRefusalOf(next, {
      seated: present.length,
      now: Date.now(),
      rendezvousChanged: changes.scheduledAt !== undefined,
    });
    if (refusal !== null) fail(refusal);
    await ctx.db.patch(season._id, {
      ...(next.theatre === null ? {} : { theatre: next.theatre }),
      scheduledAt: next.scheduledAt,
      remind: next.remind ?? undefined,
      hqCaptureHours: next.hqCaptureHours ?? undefined,
      seatCap: next.seatCap ?? undefined,
    });
    for (const entry of present) if (entry.ready) await ctx.db.patch(entry._id, { ready: false });
    const patched = await ctx.db.get(season._id);
    if (patched !== null) await planReminder(ctx, patched);
  },
});

/** **Une place, et le pseudo du compte copié dessus** — la seule écriture de `players` du jeu,
 *  partagée par les deux portes d'entrée pour qu'un champ neuf ne puisse pas en manquer une. */
async function seat(
  ctx: MutationCtx,
  account: Doc<'accounts'>,
  seasonId: Id<'seasons'>,
  creator: boolean,
): Promise<void> {
  const season = await ctx.db.get(seasonId);
  await ctx.db.insert('players', {
    ...(season !== null && modeOf(season.mode) === 'blitz' ? { lobbySeenAt: Date.now() } : {}),
    seasonId,
    accountId: account._id,
    nickname: account.nickname,
    creator,
    nation: null,
    ready: false,
    restWindow: DEFAULT_REST_WINDOW,
    enteredWarAt: null,
  });
  await countSeat(ctx, seasonId);
}

/**
 * **Le compte des places se tient à l'écriture**, parce qu'il se lit une fois par saison du
 * compte sur l'écran d'accueil (`previewOf`) : recompté à la lecture, il y faisait un `collect()`
 * par ligne, en série, et c'est ce qui a fini par dépasser la seconde en production (12/09).
 *
 * **Il ne décroît jamais, et il n'a pas à le faire** : une place ne se quitte pas, elle
 * disparaît avec sa saison (`destroy`), qui emporte le compte avec elle.
 *
 * Une saison d'avant ce champ se fait compter une fois, ici, plutôt que incrémentée à partir de
 * rien : le comptage est déjà fait quand on écrit, et la place neuve y est.
 */
async function countSeat(ctx: MutationCtx, seasonId: Id<'seasons'>): Promise<void> {
  const season = await ctx.db.get(seasonId);
  if (!season) return;
  if (season.playerCount === undefined) {
    await ctx.db.patch(seasonId, { playerCount: (await seatsOf(ctx, seasonId)).length });
    return;
  }
  await ctx.db.patch(seasonId, { playerCount: season.playerCount + 1 });
}

/**
 * **No rate limiting here, deliberately.** A game code is 6 characters over a 32-letter
 * alphabet — 32⁶ ≈ 1.07 × 10⁹ — and only lobbies still open are joinable. With ten live
 * lobbies, a brute-forcer needs some 74 million attempts for even odds of landing in one:
 * more than a week of hammering at 100 requests a second, to win the right to sit at a
 * board game with strangers.
 *
 * The mitigations available are all worse than that exposure. Convex mutations do not see
 * the client IP, so a counter has to key on something else: per season it becomes a griefing
 * lever (a stranger locks your friends out of their own lobby), and per nickname it keys on
 * a value the attacker picks. **Le compte n'y change rien** : il faut toujours le code, et le
 * refus par `SEAT_TAKEN` ne dit rien qu'un joueur déjà assis ne sache.
 *
 * What would change this: public lobbies, or codes shared beyond a group of friends.
 */
export const join = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const account = await accountOf(ctx, token);
    if (!account) fail('UNKNOWN_SESSION');
    const season = await seasonByCode(ctx, code);
    if (!season) fail('UNKNOWN_GAME_CODE');
    /**
     * **Les refus sont une seule fonction**, lue ici et par `seasons.invitation` (ADR 0015) :
     * dans l'ordre, la place déjà tenue, la saison close, la fenêtre d'inscription, la nation
     * libre, le plafond de places. Le détail de chaque ordre est écrit à côté d'elle, dans le
     * domaine.
     *
     * The theatre is the one frozen at launch — a latecomer does not redraw it. It does not
     * narrow the eight nations *yet*: the day a theatre carries its own roster, `freeNations`
     * is where it is read.
     */
    const present = await seatsOf(ctx, season._id);
    const maximum = maximumOf(season);
    const refusal = joinRefusalOf({
      seated: (await seatOf(ctx, account, season._id)) !== null,
      status: season.status,
      launchedAt: season.launchedAt,
      now: Date.now(),
      seats: present.length,
      freeNations: freeNations(present).length,
      maximum,
      mode: modeOf(season.mode),
    });
    if (refusal === 'LOBBY_FULL' || refusal === 'BLITZ_FULL') fail(refusal, { maximum });
    if (refusal !== null) fail(refusal);
    await seat(ctx, account, season._id, false);
    return { seasonId: season._id };
  },
});

/** The season a typed or linked code opens, `null` when it opens none — a code the alphabet
 *  never draws is answered without a lookup. */
async function seasonByCode(ctx: QueryCtx, code: string): Promise<Doc<'seasons'> | null> {
  const normalized = normalizeGameCode(code);
  if (normalized === null) return null;
  return ctx.db
    .query('seasons')
    .withIndex('byCode', (q) => q.eq('code', normalized))
    .unique();
}

/**
 * **Ce que la page d'invitation lit avant d'avoir un compte** (`/rejoindre/CODE`). Une query sans
 * session obligatoire, qui dit ce que `join` ferait sans rien changer : la même fonction de
 * refus, et **jamais une exception** — un code inconnu est une réponse, que la page sait dire.
 *
 * Le code est le seul secret du salon, et ce qu'il ouvre est déjà public au salon : la table
 * (pseudos, nations, lampe en Blitz) et l'ordre d'opérations, qui font décider d'entrer (note du
 * 14/10, serveur 5). Le `seasonId` ne sort que dans `seated`, pour un jeton valide qui tient déjà
 * une place ici.
 */
export const invitation = query({
  args: { code: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { code, token }) => {
    const season = await seasonByCode(ctx, code);
    if (!season) {
      return {
        refusal: 'UNKNOWN_GAME_CODE' as const,
        founder: null,
        players: 0,
        maximum: MODE_RULES.mondiale.maxPlayers,
        mode: null,
        theatre: null,
        orders: null,
        seats: [],
        status: null,
        durationHours: null,
        registrationClosesAt: null,
        seated: null,
      };
    }
    const account = token === undefined ? null : await accountOf(ctx, token);
    const mine = account === null ? null : await seatOf(ctx, account, season._id);
    const present = await seatsOf(ctx, season._id);
    const maximum = maximumOf(season);
    return {
      mode: modeOf(season.mode),
      theatre: season.theatre ?? null,
      orders: ordersOf(season),
      /** **Qui est déjà à table** : ce que le code ouvre est public au salon, et c'est ce qui fait
       *  décider d'entrer. La lampe en Blitz seulement. */
      seats: present.map((entry) => ({
        nickname: entry.nickname,
        nation: entry.nation,
        seenAt: seenAtOf(entry, season),
      })),
      refusal: joinRefusalOf({
        seated: mine !== null,
        status: season.status,
        launchedAt: season.launchedAt,
        now: Date.now(),
        seats: present.length,
        freeNations: freeNations(present).length,
        maximum,
        mode: modeOf(season.mode),
      }),
      founder: founderOf(present)?.nickname ?? null,
      players: present.length,
      maximum,
      status: season.status,
      durationHours: season.durationHours,
      registrationClosesAt: registrationDeadline(season.launchedAt),
      seated:
        mine === null
          ? null
          : { seasonId: season._id, status: season.status, atWar: isAtWar(mine, season) },
    };
  },
});

/**
 * **Une ligne d'accueil, pour une place du compte** (ADR 0022). Elle se lit depuis le compte
 * désormais (`accounts.me`) et non plus depuis une liste de jetons tenue par le navigateur :
 * c'est tout le bénéfice du compte — le même joueur retrouve ses parties sur un second
 * appareil, sans redemander le code à personne.
 *
 * Une place dont la saison a disparu est **silencieusement ignorée** plutôt que signalée : la
 * saison a été mise au rebut, et un écran d'entrée qui en ferait une erreur se condamnerait
 * sur une ligne que le joueur ne peut pas réparer.
 */
export async function previewOf(ctx: QueryCtx, player: Doc<'players'>) {
  const season = await ctx.db.get(player.seasonId);
  if (!season) return null;
  const players = season.playerCount ?? (await seatsOf(ctx, season._id)).length;
  const winnerNation = await winnerNationOf(ctx, season);
  /** **La table d'un salon, et d'un salon seulement** : la une dit qui attend qui. Une saison
   *  lancée garde sa ligne légère (le délai d'une seconde du 12/09). */
  const table =
    season.status === 'lobby'
      ? (await seatsOf(ctx, season._id)).map((entry) => ({
          nickname: entry.nickname,
          nation: entry.nation,
          ready: entry.ready,
          creator: entry.creator,
          mine: entry._id === player._id,
          seenAt: seenAtOf(entry, season),
        }))
      : [];
  return {
    orders: ordersOf(season),
    table,
    verdict: season.verdict?.reason ?? null,
    concludedAt: season.concludedAt ?? null,
    /** La saison que la ligne ouvre : c'est elle que le client retient comme place active, et
     *  elle voyage avec chaque ordre ensuite (`playerOf`). */
    seasonId: season._id,
    code: season.code,
    status: season.status,
    mode: modeOf(season.mode),
    theatre: season.theatre ?? null,
    maximum: maximumOf(season),
    durationHours: season.durationHours,
    launchedAt: season.launchedAt,
    createdAt: season._creationTime,
    playableRegion: season.playableRegion ?? playableRegion(players),
    players,
    nickname: player.nickname,
    creator: player.creator,
    nation: player.nation,
    /** A seat on a running season whose owner has not entered the war goes back to the lobby,
     *  not to the board: he holds no nation, and the board could not draw him. */
    atWar: isAtWar(player, season),
    /** **« Défaite : observer »**, et c'est tout ce que la ligne d'accueil change : elle ouvre
     *  le même plateau, en l'état. Un observateur n'est pas sorti de sa saison — il la regarde. */
    defeated: player.defeated ?? false,
    /** Enough for the home screen to say who took the season without opening the board — the
     *  only end screen the test victory gets, with the journal's headline. */
    winnerNation,
  };
}

/** La nation du vainqueur, gravée à la conclusion — et lue à la place derrière `winnerId` pour
 *  les seules saisons conclues avant que le champ existe. */
async function winnerNationOf(ctx: QueryCtx, season: Doc<'seasons'>): Promise<string | null> {
  if (season.winnerNation !== undefined) return season.winnerNation;
  const winnerId = season.winnerId ?? null;
  if (winnerId === null) return null;
  const winner = await ctx.db.get(winnerId);
  return winner === null ? null : (winner.nation ?? winner.nickname);
}

export const lobby = query({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    const present = await seatsOf(ctx, season._id);
    return {
      code: season.code,
      status: season.status,
      mode: modeOf(season.mode),
      theatre: season.theatre ?? null,
      launchRefusal: season.launchRefusal ?? null,
      maximum: maximumOf(season),
      registrationClosesAt:
        season.status === 'launched' ? registrationDeadline(season.launchedAt) : null,
      durationHours: season.durationHours,
      orders: ordersOf(season),
      /** Frozen at launch, and only widening while the lobby is still open: a latecomer joins a
       *  theatre, he does not redraw it. */
      playableRegion: season.playableRegion ?? playableRegion(present.length),
      me: {
        nickname: player.nickname,
        creator: player.creator,
        nation: player.nation,
        ready: player.ready,
        restWindow: player.restWindow,
        /** What tells the lobby which of its two faces to wear: the one before the launch, or
         *  the entry into war of somebody who arrived after it (`enterWar`). */
        atWar: isAtWar(player, season),
      },
      // The id travels so the lobby list has a stable React key: nicknames are not unique
      // (nothing forbids two "Pierre"), and keying on them collapses two rows into one.
      // A document id grants nothing on its own — every mutation authenticates by token.
      players: present.map((entry) => ({
        id: entry._id,
        nickname: entry.nickname,
        creator: entry.creator,
        nation: entry.nation,
        ready: entry.ready,
        mine: entry._id === player._id,
        restWindow: entry.restWindow,
        seenAt: seenAtOf(entry, season),
        /** On a running season "prêt" means nothing any more: what a row says is whether that
         *  seat is a nation in the field or somebody still at the door. */
        atWar: isAtWar(entry, season),
      })),
    };
  },
});

export const launch = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (!player.creator) fail('CREATOR_ONLY');
    if (season.status !== 'lobby') fail('SEASON_ALREADY_LAUNCHED');
    const now = Date.now();
    const present = await seatsOf(ctx, season._id);
    const range = seatRangeOf(modeOf(season.mode), season.theatre);
    const plan = launchPlanOf({
      mode: modeOf(season.mode),
      scheduledAt: season.scheduledAt ?? null,
      range,
      now,
      caller: player._id,
      seats: present.map((entry) => ({
        id: entry._id,
        nickname: entry.nickname,
        ready: entry.ready,
        seenAt: entry.lobbySeenAt ?? null,
      })),
    });
    if (plan.refusal === 'NOT_ENOUGH_PLAYERS') fail(plan.refusal, { minimum: range.min });
    /** Un plafond revu à la baisse après que le salon s'est rempli : la carte ne se poserait pas. */
    if (plan.refusal === 'BLITZ_FULL') fail(plan.refusal, { maximum: range.max });
    if (plan.refusal !== null) fail(plan.refusal, { nicknames: plan.nicknames });

    const theatre =
      season.theatre === THEATRE_DRAW ? drawTheatre(season.seed, present.length) : season.theatre;
    await ctx.db.patch(season._id, {
      status: 'launched',
      launchedAt: now,
      launchRefusal: undefined,
      playableRegion: playableRegion(present.length),
      playerCount: present.length,
      ...(theatre === undefined ? {} : { theatre }),
    });
    await ctx.scheduler.runAfter(0, internal.messages.erase, { seasonId: season._id, lobby: true });
    /** **L'absent parti sans nation en reçoit une** (J1 b) : en Blitz elles sont identiques. */
    for (const entry of present) {
      if (entry.nation !== null) continue;
      const nation = freeNations(present)[0];
      if (nation === undefined) fail('NO_FREE_NATION');
      entry.nation = nation;
      await ctx.db.patch(entry._id, { nation });
    }
    for (const entry of present) {
      await endow(ctx, entry, season, now);
      await notifyPlayer(ctx, entry._id, {
        type: 'season',
        phrase: push.seasonLaunched,
        url: journalUrl,
        at: now,
      });
    }

    /**
     * **La première édition du classement**, à `launchedAt + PRESS_EDITION_HOURS` et pas une
     * minute avant : au lancement tout le monde a la même dotation, il n'y a rien à raconter.
     * Le travail se replanifie ensuite lui-même (`convex/press.ts`), comme les files.
     */
    /** **Une Blitz n'a pas d'édition en cours de partie** : deux heures n'en laisseraient pas
     *  paraître une seule. Son horloge, elle, la conclut (B11), et la conclusion écrit
     *  l'édition finale. */
    if (modeOf(season.mode) === 'blitz' && season.durationHours !== null) {
      const endsAt = now + season.durationHours * 3_600_000;
      await ctx.scheduler.runAt(endsAt, internal.blitz.closeAtClock, {
        seasonId: season._id,
        expectedAt: endsAt,
      });
    } else {
      await ctx.scheduler.runAfter(PRESS_EDITION_HOURS * 3_600_000, internal.press.publish, {
        playerId: present[0]!._id,
      });
    }

    /**
     * **Les objectifs neutres se posent dans leur propre travail, et ce travail est une action**
     * (objectifs neutres, 17/09/2026). Le lancement porte déjà la dotation de chacun ; y ajouter
     * un champ de distances par quartier général et une route par paire de voisins, c'est mettre
     * **plus** que la seconde d'une mutation sur le geste qui ouvre la partie — mesuré à 700 ms à
     * chaud sur huit sièges, donc largement au-delà à froid sur le VPS. Une action n'a pas ce
     * plafond ; elle n'a pas de transaction non plus, d'où `objectives.commit` derrière elle. Ce
     * que la séparation achète est une saison **jouable avant que les dépêches tombent** : le
     * plateau s'ouvre, les réserves paraissent une seconde plus tard.
     */
    /** **La Blitz tire sa carte de départ au lieu de ses objectifs** (lot 4) : un QG et une
     *  caserne par joueur, le reste neutre, par la même mécanique en trois temps. */
    await ctx.scheduler.runAfter(
      0,
      modeOf(season.mode) === 'blitz' ? internal.blitz.place : internal.objectives.place,
      { seasonId: season._id },
    );
  },
});

/**
 * **The entry into war of a latecomer** — the launch he missed, for him alone. He is endowed
 * exactly as the others were (`endow`): same kit, same foundation still owed — headquarters included
 * since the decision of 13/09 —,
 * and no compensation for the hours he was not there. The measure of that handicap will come
 * from a real case, not from a number invented here.
 *
 * No "ready" and no relaunch: the launch happened, the season is running, and nobody waits for
 * him. What he has to have is what a seat needs to become a nation — a free flag.
 */
export const enterWar = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    /** Twice-clicked is not an error: the second call finds a belligerent and hands out
     *  nothing. Answering with a refusal would be telling him his own entry failed. */
    if (isAtWar(player, season)) return;
    if (modeOf(season.mode) === 'blitz') fail('BLITZ_STARTED');
    if (player.nation === null) fail('NATION_REQUIRED');

    const present = await seatsOf(ctx, season._id);
    const holder = present.find(
      (entry) => entry.nation === player.nation && entry._id !== player._id,
    );
    if (holder) fail('NATION_TAKEN', { nation: player.nation, nickname: holder.nickname });

    await endow(ctx, player, season, Date.now());
  },
});

/**
 * **The one exit a season has**, whichever door it takes: the test victory when a pass crosses
 * the threshold (`victory.ts`), and the founder's own hand when there is no clock to end it
 * (`conclude`). Three fields, written once, so a season taken and a season closed cannot end up
 * in two subtly different states — `winnerId: null` is the whole difference, and it is the
 * honest one: nobody won.
 */
export async function concludeSeason(
  ctx: MutationCtx,
  seasonId: Id<'seasons'>,
  winnerId: Id<'players'> | null,
  at: number,
  verdict?: Infer<typeof VERDICT>,
): Promise<void> {
  /**
   * **L'édition finale s'écrit d'abord** (`classement-bareme.md` §5) : après le `patch`, le
   * garde-fou de tout travail planifié (`seasonStillPlays`) la refuserait — ce qui est
   * précisément ce qui arrête toutes les suivantes. C'est le classement que la page de presse
   * tamponne, et il n'y a pas d'écran de fin pour le doubler.
   */
  await publishFinalEdition(ctx, seasonId, at);
  /** La nation part avec l'identifiant, dans la même écriture : l'accueil nomme le vainqueur
   *  sans rouvrir sa place, et la place, elle, peut disparaître au wipe. */
  const winner = winnerId === null ? null : await ctx.db.get(winnerId);
  await ctx.db.patch(seasonId, {
    status: 'concluded',
    winnerId,
    winnerNation: winner === null ? null : (winner.nation ?? winner.nickname),
    concludedAt: at,
    ...(verdict === undefined ? {} : { verdict }),
  });
  await ctx.scheduler.runAfter(0, internal.messages.erase, { seasonId, lobby: false });
  for (const entry of await seatsOf(ctx, seasonId)) {
    await notifyPlayer(ctx, entry._id, {
      type: 'season',
      phrase: winnerId === null ? push.seasonConcluded : push.seasonDominated,
      url: journalUrl,
      at,
    });
  }
}

/**
 * **Depuis quand on ne l'a plus vu.** Un siège déposé avant que la présence existe ne porte pas
 * le champ, et le lancement de la saison fait alors foi : un fondateur d'avant n'est pas un
 * fondateur absent depuis toujours, il est un fondateur qu'on n'a pas encore mesuré. Le
 * `_creationTime` ne sert que le cas dégénéré d'une saison au salon, qui n'a pas d'heure de
 * lancement et où la clôture n'existe pas.
 */
export function lastSeenOf(player: Doc<'players'>, season: Doc<'seasons'>): number {
  return player.lastSeenAt ?? season.launchedAt ?? player._creationTime;
}

/** L'heure à partir de laquelle le doyen peut clore à la place du fondateur. */
export const concludeOpensAt = (founder: Doc<'players'>, season: Doc<'seasons'>): number =>
  lastSeenOf(founder, season) + FOUNDER_ABSENCE_HOURS * 3_600_000;

export const founderOf = (seats: ReadonlyArray<Doc<'players'>>): Doc<'players'> | null =>
  seats.find((seat) => seat.creator) ?? null;

/**
 * **Le doyen : le plus ancien belligérant debout qui n'est pas le fondateur.** Le rang d'entrée
 * plutôt qu'un vote, comme le successeur d'une capitulation (`players.surrender`) — et le
 * fondateur en est exclu par construction, sans quoi le doyen serait presque toujours lui et la
 * porte ne s'ouvrirait sur personne.
 */
export function elderOf(
  seats: ReadonlyArray<Doc<'players'>>,
  season: Doc<'seasons'>,
  founder: Doc<'players'>,
): Doc<'players'> | null {
  return (
    [...seats]
      .filter((seat) => seat._id !== founder._id && seat.defeated !== true && isAtWar(seat, season))
      .sort((left, right) => left._creationTime - right._creationTime)[0] ?? null
  );
}

/**
 * **Qui peut clore, et pourquoi pas.** Une seule fonction pour la mutation et pour la vue
 * (ADR 0015) : ce que le plateau propose et ce que le serveur accepte ne peuvent pas diverger,
 * et il n'y a donc pas de bouton grisé à expliquer.
 *
 * Le fondateur passe toujours ; le doyen passe quand le fondateur n'a plus été vu depuis
 * `FOUNDER_ABSENCE_HOURS`. **Le titre ne bouge pas** — le fondateur reste fondateur, il a
 * seulement perdu l'exclusivité, et il la reprend à son retour puisque la présence se réécrit.
 */
export function concludeRefusal(
  player: Doc<'players'>,
  seats: ReadonlyArray<Doc<'players'>>,
  season: Doc<'seasons'>,
  now: number,
): 'CREATOR_ONLY' | 'FOUNDER_STILL_PRESENT' | null {
  if (player.creator) return null;
  const founder = founderOf(seats);
  if (founder === null) return 'CREATOR_ONLY';
  /** Le rang d'abord, l'heure ensuite : à qui n'est pas le doyen on ne dit rien du fondateur.
   *  L'absence est publique, mais elle n'a de sens que pour la main à qui elle ouvre la porte. */
  if (elderOf(seats, season, founder)?._id !== player._id) return 'CREATOR_ONLY';
  return now < concludeOpensAt(founder, season) ? 'FOUNDER_STILL_PRESENT' : null;
}

/**
 * **Le fondateur clôt la saison, à la main.** C'est la seule fin d'une partie sans horloge
 * (révision du 27/08 de l'ADR 0017), et la fin à l'heure n'existe de toute façon pas encore : ce
 * bouton rend le fait honnête plutôt que de le cacher derrière un compte à rebours qui ne
 * déclenche rien.
 *
 * Elle ne désigne personne — `winnerId` reste nul — et elle ne détruit rien : le plateau et le
 * journal servent une saison close (`requireStarted`), c'est la partie qu'on relit avant le wipe.
 * Les ordres, eux, sont refusés (`requirePlayable`), et les travaux planifiés se taisent
 * (`seasonStillPlays`).
 */
export const conclude = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (season.status !== 'launched') fail('SEASON_NOT_LAUNCHED');

    const now = Date.now();
    const present = await seatsOf(ctx, season._id);
    const refusal = concludeRefusal(player, present, season, now);
    if (refusal !== null) fail(refusal);

    await concludeSeason(ctx, season._id, null, now);
    for (const entry of present) {
      await ctx.db.insert('notices', { playerId: entry._id, at: now, kind: 'seasonClosed' });
    }
  },
});

/**
 * **The founder scraps the season, for everyone.** No vote and no soft delete: a season is
 * disposable by design (ADR 0001), and between friends the one who opened the lobby is the one
 * who closes it. The others hold a token that no longer answers — the lobby and the board both
 * treat that as a stale token and send them home, which is exactly what happened.
 *
 * Scheduled functions are not cancelled: a construction or a batch that fires afterwards finds
 * nothing to read and returns. That is already how a cancelled batch behaves.
 */
export const destroy = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (!player.creator) fail('CREATOR_ONLY');

    const present = await everySeatOf(ctx, season._id);
    for (const entry of present) {
      await erasePlayer(ctx, entry._id);
      await ctx.db.delete(entry._id);
    }
    /** **Un objectif n'appartient à personne** — il pend à la saison et à rien d'autre, donc
     *  `erasePlayer` ne peut pas l'emporter : c'est ici qu'il tombe, ou nulle part. */
    for (const objective of await ctx.db
      .query('objectives')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect()) {
      await ctx.db.delete(objective._id);
    }
    for (const queued of await ctx.db
      .query('pushQueue')
      .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
      .collect()) {
      await ctx.db.delete(queued._id);
    }
    await ctx.db.delete(season._id);
  },
});

/**
 * **Everything hanging from one player**, which is every table the schema indexes `byPlayer`
 * plus the engagements he opened. The list is not a memo of what the game held when this was
 * written — a table left out survives its season as an orphan nobody can reach — so
 * `off-season.test.ts` walks the schema itself and fails on the next table that forgets to
 * appear here.
 *
 * Engagements are taken by attacker only, and that is enough: both sides of an engagement sit
 * in the same season, `destroy` erases all of them, and every account has exactly one
 * attacker — going by defender as well would delete the same row twice.
 */
async function erasePlayer(ctx: MutationCtx, playerId: Id<'players'>): Promise<void> {
  const player = await ctx.db.get(playerId);
  const byPlayer = async (
    table:
      | 'constructions'
      | 'recruitments'
      | 'troops'
      | 'buildings'
      | 'resources'
      | 'orders'
      | 'movements'
      | 'outposts'
      | 'sightings'
      | 'campSightings'
      | 'lootCrateSightings'
      | 'regionSightings'
      | 'stationedLoot'
      | 'notices'
      | 'presences'
      | 'readMarks'
      | 'messages'
      | 'captures',
  ) =>
    ctx.db
      .query(table)
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();

  /** Les frappes pendent à l'engagement et non au joueur : elles partent avec le compte rendu
   *  qui les nomme, sans quoi la table garderait des lignes que plus aucun index n'atteint. */
  const accounts = await ctx.db
    .query('engagements')
    .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
    .collect();
  for (const account of accounts) {
    for (const strike of await ctx.db
      .query('strikes')
      .withIndex('byEngagement', (q) => q.eq('engagementId', account._id))
      .collect()) {
      await ctx.db.delete(strike._id);
    }
  }

  /** Les éditions pendent au joueur par un index composé — le préfixe suffit à les balayer,
   *  et un second index par joueur seul serait une clé de plus à tenir pour la même réponse. */
  const editions = await ctx.db
    .query('editions')
    .withIndex('byPlayerAt', (q) => q.eq('playerId', playerId))
    .collect();

  const plunderReports = new Map(
    [
      ...(await ctx.db
        .query('plunderReports')
        .withIndex('byAttacker', (q) => q.eq('attackerId', playerId))
        .collect()),
      ...(await ctx.db
        .query('plunderReports')
        .withIndex('byDefender', (q) => q.eq('defenderId', playerId))
        .collect()),
    ].map((report) => [report._id, report]),
  );
  const lootRecoveries = await ctx.db
    .query('lootRecoveries')
    .withIndex('byRecoveringPlayer', (q) => q.eq('recoveringPlayerId', playerId))
    .collect();
  const lootCollections = await ctx.db
    .query('lootCollections')
    .withIndex('byCollector', (q) => q.eq('collectorPlayerId', playerId))
    .collect();
  const lootCrates = (
    await Promise.all(
      lootRecoveries.map((recovery) =>
        ctx.db
          .query('lootCrates')
          .withIndex('byRecovery', (q) => q.eq('recoveryId', recovery._id))
          .collect(),
      ),
    )
  ).flat();
  const lootCrateDetectionJobs =
    player === null
      ? []
      : await ctx.db
          .query('lootCrateDetectionJobs')
          .withIndex('bySeason', (q) => q.eq('seasonId', player.seasonId))
          .collect();
  const lootRumors =
    player === null
      ? []
      : await ctx.db
          .query('lootRumors')
          .withIndex('bySeason', (q) => q.eq('seasonId', player.seasonId))
          .collect();

  const owned = [
    ...editions,
    ...plunderReports.values(),
    ...lootCrates,
    ...lootCrateDetectionJobs,
    ...lootRumors,
    ...lootRecoveries,
    ...lootCollections,
    ...(await byPlayer('captures')),
    ...(await byPlayer('constructions')),
    ...(await byPlayer('recruitments')),
    ...(await byPlayer('troops')),
    ...(await byPlayer('buildings')),
    ...(await byPlayer('resources')),
    ...(await byPlayer('orders')),
    ...(await byPlayer('movements')),
    ...(await byPlayer('outposts')),
    ...(await byPlayer('sightings')),
    ...(await byPlayer('campSightings')),
    ...(await byPlayer('lootCrateSightings')),
    ...(await byPlayer('regionSightings')),
    ...(await byPlayer('stationedLoot')),
    ...(await byPlayer('notices')),
    ...(await byPlayer('presences')),
    ...(await byPlayer('readMarks')),
    ...(await byPlayer('messages')),
    ...accounts,
  ];
  for (const doc of owned) await ctx.db.delete(doc._id);
}

/** La lampe d'une place, servie en Blitz seulement (ADR 0005). */
const seenAtOf = (entry: Doc<'players'>, season: Doc<'seasons'>): number | null =>
  modeOf(season.mode) === 'blitz' && season.status === 'lobby' ? (entry.lobbySeenAt ?? null) : null;

/**
 * The nations nobody holds. Read off the seats present rather than off a stored roster: a
 * reservation is released with a click as long as the holder has not entered the war.
 */

export const freeNations = (
  present: ReadonlyArray<Doc<'players'>>,
): ReadonlyArray<(typeof NATIONS)[number]> =>
  NATIONS.filter((nation) => !present.some((entry) => entry.nation === nation));

async function freeCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = gameCode(Math.random);
    const existing = await ctx.db
      .query('seasons')
      .withIndex('byCode', (q) => q.eq('code', code))
      .unique();
    if (!existing) return code;
  }
  fail('NO_FREE_GAME_CODE');
}
