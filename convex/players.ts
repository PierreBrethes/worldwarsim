import { v } from 'convex/values';
import { mutation, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { modeOf } from '../src/domain/season-mode';
import { NATIONS, PRESENCE_THROTTLE_MIN, restWindowFrom } from './constants';
import { fail } from './errors';
import { concludeSeason } from './seasons';
import { isAtWar, playerOf, requirePlayable, seatsOf } from './seats';
import { recordLinkage } from './holding';
import { handOver, seasonPoints } from './strategicPoints';
import { refreshSession } from './sessions';

/**
 * **Il est là.** La seule écriture de présence du jeu, et elle n'a qu'un lecteur : le fondateur
 * qui ne revient plus perd l'exclusivité de la clôture (`seasons.conclude`). Une query ne peut
 * pas écrire, donc c'est le client qui frappe — au montage du plateau, puis toutes les
 * `PRESENCE_THROTTLE_MIN` minutes.
 *
 * **Le serveur ne fait pas confiance à cette cadence** : sous le seuil il ne réécrit rien. Sans
 * ce frein, un client qui remonte le plateau à chaque navigation réinvaliderait la vue de tout
 * le monde à chaque fois, pour une valeur que rien ne lit à la minute.
 *
 * **No-op plutôt que refus**, sur un salon comme sur un défait : ce n'est pas un ordre, personne
 * ne l'a demandée, et une erreur remontée ici s'afficherait au bandeau d'un joueur qui n'a rien
 * fait. Un défait n'a pas de présence à tenir — il observe, et le fondateur qu'il n'est plus
 * (`surrender` passe le titre) n'a rien à retenir.
 */
export const touch = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    /** Le plateau ouvert est ce qui tient une session en vie (`convex/sessions.ts`) — salon et
     *  observateur compris, d'où sa place avant les deux sorties. */
    await refreshSession(ctx, token);
    if (season.status !== 'launched') return;
    if (player.defeated === true) return;

    const now = Date.now();
    const seen = player.lastSeenAt;
    if (seen !== undefined && now - seen < PRESENCE_THROTTLE_MIN * 60_000) return;
    await ctx.db.patch(player._id, { lastSeenAt: now });
  },
});

/**
 * **À la table** (choix 7) : le salon d'une Blitz bat toutes les `LOBBY_BEAT_SECONDS`, et la
 * lampe de chaque carton se lit sur ce battement. Rien en Mondiale, ni avant ni après : la
 * présence y serait un canal sur les plages de repos (ADR 0005).
 */
export const beatLobby = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (season.status !== 'lobby' || modeOf(season.mode) !== 'blitz') return;
    await ctx.db.patch(player._id, { lobbySeenAt: Date.now() });
  },
});

/**
 * **The choices of the lobby seal at the player's entry into war** — the launch, since nobody
 * enters after it (ADR 0027 §4).
 *
 * A concluded season answers with its own code: it is not "already launched", it is over.
 */
function requireStillChoosing(player: Doc<'players'>, season: Doc<'seasons'>): void {
  if (season.status === 'concluded') fail('SEASON_CONCLUDED');
  if (isAtWar(player, season)) fail('SEASON_ALREADY_LAUNCHED');
}

export const reserveNation = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), nation: v.union(v.string(), v.null()) },
  handler: async (ctx, { token, seasonId, nation }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireStillChoosing(player, season);
    if (nation === null) {
      await ctx.db.patch(player._id, { nation: null, ready: false });
      return;
    }
    if (!NATIONS.includes(nation as (typeof NATIONS)[number])) fail('UNKNOWN_NATION');
    const present = await seatsOf(ctx, season._id);
    const holder = present.find((entry) => entry.nation === nation);
    if (holder && holder._id !== player._id) {
      fail('NATION_TAKEN', { nation, nickname: holder.nickname });
    }
    await ctx.db.patch(player._id, { nation });
  },
});

export const declareReady = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), ready: v.boolean() },
  handler: async (ctx, { token, seasonId, ready }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireStillChoosing(player, season);
    if (ready && player.nation === null) fail('NATION_REQUIRED');
    await ctx.db.patch(player._id, { ready });
  },
});

/**
 * The rest window is declared before entering the war and frozen there, like the nation. Left
 * open mid-season it becomes a shield one slides: the window is public, so a
 * player who sees a movement heading his way could move his hours over its arrival and buy
 * himself a stall at the border. Being able to promise "I sleep at these hours" only means
 * something if the promise cannot move once the shooting starts.
 *
 * The cost, assumed: over a 7-day season, a player whose real schedule changes cannot follow.
 */
export const setRestWindow = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), startMinutes: v.number() },
  handler: async (ctx, { token, seasonId, startMinutes }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    if (isAtWar(player, season)) fail('REST_WINDOW_FROZEN');
    if (!Number.isInteger(startMinutes) || startMinutes < 0 || startMinutes >= 1440) {
      fail('INVALID_REST_WINDOW');
    }
    await ctx.db.patch(player._id, { restWindow: restWindowFrom(startMinutes) });
  },
});

/**
 * **Déposer les armes** (décision de Pierre, 31/08). Un joueur qui ne veut plus jouer n'avait
 * jusqu'ici qu'une sortie : fermer l'onglet. Personne ne *quittait* jamais une saison, ce qui est
 * exactement pourquoi le titre de fondateur n'avait nulle part où se transmettre — la
 * capitulation est l'événement qui manquait, et elle referme les deux trous d'un coup.
 *
 * **Irréversible, et lancée seulement.** `requirePlayable` dit les deux : une saison en cours, et
 * un joueur qui n'a pas déjà capitulé — le second appel se refuse au lieu de rejouer les
 * dépêches. Le salon n'a rien à capituler, une saison conclue non plus.
 *
 * **Ce qui ne change pas.** Ses troupes posées restent et défendent : une garnison n'a pas besoin
 * d'ordre (ADR 0019), et rien ici ne touche à une ligne de `troops`. Ses avant-postes tiennent,
 * paient leur entretien et gardent son encre tant qu'ils existent ; son stock s'épuise, et à sec
 * rien ne meurt. Le défait reste pillable — capituler n'est pas s'évaporer, sinon la reddition
 * serait la meilleure défense du jeu.
 *
 * **Sa vue non plus ne change pas** (décision 47a) : `playerView` se calcule comme avant, portée
 * par ses détecteurs restants, et se fige à mesure qu'ils tombent. Lever le brouillard pour un
 * observateur ferait de la capitulation un acte de renseignement au profit d'un survivant ami —
 * il n'y a donc rien à débloquer, seulement rien à ajouter.
 */
export const surrender = mutation({
  args: { token: v.string(), seasonId: v.id('seasons') },
  handler: async (ctx, { token, seasonId }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requirePlayable(player, season);
    /** On ne capitule que d'une guerre où l'on est entré : un siège qui choisit encore son
     *  drapeau n'a pas d'armes à déposer, et il ne compte dans aucune fin de saison. */
    if (!isAtWar(player, season)) fail('NOT_AT_WAR');

    await leaveTheWar(ctx, season, player, Date.now(), { kind: 'playerSurrendered' });
  },
});

/**
 * **Sortir de la guerre, par la capitulation ou par la chute de son QG** (B10) : la même sortie,
 * parce qu'elle a les mêmes conséquences pour la table — défait, commandement transmis, saison
 * conclue s'il ne reste qu'un belligérant. Seule la dépêche dit laquelle.
 */
export async function leaveTheWar(
  ctx: MutationCtx,
  season: Doc<'seasons'>,
  player: Doc<'players'>,
  now: number,
  exit:
    | { readonly kind: 'playerSurrendered' }
    | {
        readonly kind: 'playerEliminated';
        readonly by: string;
        readonly capturerId: Id<'players'>;
        readonly irregulars: boolean;
      },
): Promise<void> {
  await ctx.db.patch(
    player._id,
    exit.kind === 'playerEliminated' ? { defeated: true, eliminatedAt: now } : { defeated: true },
  );
  /** **Qui sort de la guerre sort de la course** (M1) : ses points stratégiques redeviennent
   *  neutres, et le compte à rebours qu'il menait tombe avec eux. */
  for (const point of await seasonPoints(ctx, season._id)) {
    if (point.holderId === player._id) await handOver(ctx, point, null, now);
  }
  /** Ses points rendus, et son sol perdu s'il est éliminé (`homeGroundsOf`) : la couleur que la
   *  vue lira change (#144). */
  await recordLinkage(ctx, season._id);

  const present = await seatsOf(ctx, season._id);
  const standing = present.filter((seat) => seat._id !== player._id && seat.defeated !== true);

  /**
   * **Le commandement passe au plus ancien joueur encore debout.** Le rang d'entrée plutôt
   * qu'un vote : entre amis, celui qui est là depuis le début est celui qui saura clore, et
   * une élection à deux joueurs n'est pas une élection.
   *
   * Le titre n'est retiré que s'il y a une main pour le prendre : le dernier fondateur d'une
   * saison où plus personne n'est debout le garde, ce qui tient l'invariant — un `creator` par
   * saison, jamais zéro.
   */
  const successor = player.creator
    ? ([...standing].sort((left, right) => left._creationTime - right._creationTime)[0] ?? null)
    : null;
  if (successor !== null) {
    await ctx.db.patch(player._id, { creator: false });
    await ctx.db.patch(successor._id, { creator: true });
  }

  /** Deux nouvelles publiques, déposées chez tout le monde : qui ne joue plus change la table,
   *  et qui commande la partie décide de sa fin. Ni l'une ni l'autre n'est un secret. */
  const nameOf = (seat: Doc<'players'>) => seat.nation ?? seat.nickname;
  for (const seat of present) {
    await ctx.db.insert('notices', {
      playerId: seat._id,
      at: now,
      nation: nameOf(player),
      ...(exit.kind === 'playerSurrendered'
        ? { kind: exit.kind }
        : {
            kind: exit.kind,
            ...(seat._id === player._id || seat._id === exit.capturerId ? { by: exit.by } : {}),
            ...(exit.irregulars ? { irregulars: true as const } : {}),
          }),
    });
    if (successor !== null) {
      await ctx.db.insert('notices', {
        playerId: seat._id,
        at: now,
        kind: 'commandTransferred',
        nation: nameOf(successor),
      });
    }
  }

  /**
   * **La capitulation générale est une victoire, pas une clôture administrative.** Le dernier
   * belligérant debout prend la saison par la sortie commune (`concludeSeason`), avec son nom
   * dessus — le journal et l'accueil le lisent comme n'importe quelle autre fin.
   *
   * Le compte est celui des **belligérants**, comme partout ailleurs (`victory.standingsOf`) :
   * un siège pris sur une saison en cours dont le propriétaire choisit encore son drapeau
   * n'est pas une nation debout, et le laisser compter gèlerait la fin pour toujours.
   */
  const belligerents = standing.filter((seat) => isAtWar(seat, season));
  const survivor = belligerents.length === 1 ? belligerents[0] : undefined;
  if (survivor === undefined) return;
  /** **L'édition finale dit pourquoi** : le dernier debout l'est par un QG tombé — l'écrasement
   *  d'une Mondiale (M2a) — ou par la capitulation des autres. */
  const verdict = {
    reason: exit.kind === 'playerEliminated' ? ('hqTaken' as const) : ('lastStanding' as const),
  };
  await concludeSeason(ctx, season._id, survivor._id, now, verdict);
}
