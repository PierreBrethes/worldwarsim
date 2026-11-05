/**
 * **`--conclue <raison>`** (#455) : la Mondiale de la démo se conclut par `dev:concludeScene`
 * (`points`, `clock`, `draw` ou `closed`), et son édition finale s'ouvre à `/edition/<id>` (lieu
 * `edition`). Pour l'accueil, une seconde Mondiale à deux se conclut d'abord, attend son archive,
 * puis est détruite : sa une reste lisible, sa saison n'est plus là (`edition-detruite`).
 * `--en-attente` retient la chaîne de clôture : l'édition reste « sous presse », à capturer.
 * `--sans-archive` conclut la saison il y a plus d'une demi-heure, la chaîne retenue : l'édition
 * n'existe pas, comme pour une saison conclue avant le déploiement.
 *
 * À part du script principal, qui change sur d'autres branches : il n'appelle que `concludeDemo`.
 */
import { api } from '../convex/_generated/api.js';

const REASONS = ['points', 'clock', 'draw', 'closed'];
/** La chaîne écrit l'archive en quelques secondes ; au-delà, quelque chose est cassé. */
const ARCHIVE_WAIT_MS = 60_000;

async function archiveOf(client, pause, token, seasonId) {
  const until = Date.now() + ARCHIVE_WAIT_MS;
  for (;;) {
    const read = await client.query(api.finalEdition.ofSeason, { token, seasonId });
    if (read.state === 'ready') return read.edition._id;
    if (Date.now() > until) throw new Error(`Édition finale de ${seasonId} : ${read.state}`);
    await pause(1000);
  }
}

/** `--conclue <raison>` lu sur la ligne de commande, `null` sans l'option. */
export function conclusionAsked(argv) {
  const at = argv.indexOf('--conclue');
  if (at < 0) return null;
  const reason = argv[at + 1];
  if (!REASONS.includes(reason))
    throw new Error(`--conclue attend ${REASONS.join(', ')} ; reçu ${reason}`);
  return {
    reason,
    hold: argv.includes('--en-attente'),
    stale: argv.includes('--sans-archive'),
  };
}

/** Conclut la saison de la démo, après une saison détruite pour l'accueil ; rend les lieux. */
export async function concludeDemo({ client, cli, pause, tokens, seasonId, reason, hold, stale }) {
  const [tokenA, tokenB] = tokens;
  const past = await client.mutation(api.seasons.create, {
    token: tokenA,
    compensation: 0,
    mode: 'mondiale',
  });
  await client.mutation(api.seasons.join, { token: tokenB, code: past.code });
  for (const [token, nation] of [
    [tokenA, 'france'],
    [tokenB, 'uk'],
  ]) {
    await client.mutation(api.players.reserveNation, { token, seasonId: past.seasonId, nation });
    await client.mutation(api.players.declareReady, {
      token,
      seasonId: past.seasonId,
      ready: true,
    });
  }
  await client.mutation(api.seasons.launch, { token: tokenA, seasonId: past.seasonId });
  cli(['run', 'dev:concludeScene', JSON.stringify({ seasonId: past.seasonId, reason: 'draw' })]);
  const pastId = await archiveOf(client, pause, tokenA, past.seasonId);
  await client.mutation(api.seasons.destroy, { token: tokenA, seasonId: past.seasonId });

  cli(['run', 'dev:concludeScene', JSON.stringify({ seasonId, reason, hold, stale })]);
  const places = { 'edition-detruite': `/edition/${pastId}` };
  if (!hold && !stale)
    places.edition = `/edition/${await archiveOf(client, pause, tokenA, seasonId)}`;
  return places;
}
