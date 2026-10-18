/**
 * **Une Mondiale lancée, en local, pour les captures.** Joue le parcours de deux vrais joueurs
 * par l'API publique : inscription (ou connexion), fondation, adhésion par le code, nation,
 * « prêt », lancement. Puis, sauf `--nu`, remplit les stocks et pose des troupes (`convex/dev.ts`).
 *
 *     npm run demo:mondiale
 *
 * Refuse toute URL qui n'est pas 127.0.0.1 ou localhost. Les comptes (mot de passe compris) vont
 * dans `scripts/demo-mondiale.accounts.json`, ignoré par git, et lu par `scripts/capture.mjs`.
 * Une démo existante est réutilisée : les comptes restent, une nouvelle partie est fondée.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const accountsFile = fileURLToPath(new URL('./demo-mondiale.accounts.json', import.meta.url));
const bare = process.argv.includes('--nu');

const env = Object.fromEntries(
  (existsSync(`${root}.env.local`) ? readFileSync(`${root}.env.local`, 'utf8') : '')
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim()]),
);
const url = process.env.VITE_CONVEX_URL ?? env.VITE_CONVEX_URL;
if (!url) throw new Error('VITE_CONVEX_URL absent (.env.local)');
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error(`Refus : ${url} n'est pas un backend local.`);
}
/** `npx convex run` lit `.env.local` : il doit viser le même backend, sinon on mélangerait deux bases. */
const cliUrl = process.env.CONVEX_SELF_HOSTED_URL ?? env.CONVEX_SELF_HOSTED_URL;
if (cliUrl !== url)
  throw new Error(`CONVEX_SELF_HOSTED_URL (${cliUrl}) ≠ VITE_CONVEX_URL (${url})`);

const saved = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : {};
const accounts = {
  a: saved.a ?? { nickname: 'DemoAlpha', password: randomBytes(9).toString('base64url') },
  b: saved.b ?? { nickname: 'DemoBravo', password: randomBytes(9).toString('base64url') },
};
const client = new ConvexHttpClient(url);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function signIn({ nickname, password }) {
  try {
    return (await client.action(api.auth.login, { nickname, password })).token;
  } catch {
    await pause(400);
    return (await client.action(api.auth.register, { nickname, password })).token;
  }
}

const cli = (args) => execFileSync('npx', ['convex', ...args], { cwd: root, encoding: 'utf8' });

const tokenA = await signIn(accounts.a);
await pause(400);
const tokenB = await signIn(accounts.b);

const { code, seasonId } = await client.mutation(api.seasons.create, {
  token: tokenA,
  compensation: 0,
  mode: 'mondiale',
});
await client.mutation(api.seasons.join, { token: tokenB, code });
for (const [token, nation] of [
  [tokenA, 'france'],
  [tokenB, 'uk'],
]) {
  await client.mutation(api.players.reserveNation, { token, seasonId, nation });
  await client.mutation(api.players.declareReady, { token, seasonId, ready: true });
}
await client.mutation(api.seasons.launch, { token: tokenA, seasonId });

const scene = { a: null, b: null };
if (!bare) {
  cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 400 })]);
  const rows = cli(['data', 'players', '--limit', '200', '--format', 'jsonl'])
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((row) => row.seasonId === seasonId);
  const at = { france: [2.35, 48.85], uk: [-0.12, 51.5] };
  for (const [key, nation] of [
    ['a', 'france'],
    ['b', 'uk'],
  ]) {
    const player = rows.find((row) => row.nation === nation);
    if (!player) continue;
    scene[key] = player._id;
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({
        playerId: player._id,
        role: 'infantry',
        count: 3,
        lon: at[nation][0],
        lat: at[nation][1],
      }),
    ]);
  }
}

writeFileSync(accountsFile, `${JSON.stringify({ ...accounts, code, seasonId }, null, 2)}\n`);
console.log(`Mondiale lancée : code ${code}, saison ${seasonId}`);
console.log(`Comptes : ${accounts.a.nickname} (a), ${accounts.b.nickname} (b) → ${accountsFile}`);
