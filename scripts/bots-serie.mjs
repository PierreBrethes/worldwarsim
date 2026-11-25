/**
 * **Une série de Mondiales de bots, jouées jusqu'à leur fin** (#652). Chaque partie tourne en
 * mémoire (`convex/botsSerie.sim.ts`, sous `convex-test`) : l'horloge saute, les règles restent.
 * Ni backend ni réseau. Une partie par processus, `--jobs` à la fois ; la graine `--germe + k`
 * fixe la partie k (le germe de saison et le `Math.random` du serveur).
 *
 *     npm run bots:serie -- [--parties 4] [--germe 1] [--nations france,uk,…] [--cadence 60]
 *                           [--pas 5] [--heures 168] [--releve 24] [--jobs 2] [--sortie dossier]
 *
 * `--cadence` : minutes de saison entre deux passages d'un bot (`@a-mesurer`, comme celle de
 * `bots:mondiale`). `--pas` : minutes entre deux réveils du planificateur. `--releve` : heures
 * entre deux relevés de l'instant. Sortie : un rapport `partie-<germe>.md` par partie, ses chiffres
 * en `.json`, et `resume.md` pour la série.
 *
 * **Limite** : des bots faciles (ADR 0042) ne mesurent pas l'équilibre entre humains. Ils ne
 * recherchent pas, n'élèvent ni n'attaquent que pour défendre leur QG. La série dégrossit (une
 * valeur absurde, une nation qui ne gagne jamais), elle ne calibre pas.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const optionOf = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : process.argv[at + 1];
};
const NATIONS = ['france', 'uk', 'usa', 'ussr', 'germany', 'japan', 'italy', 'china'];
const games = Number(optionOf('parties', 4));
const seed = Number(optionOf('germe', 1));
const nations = optionOf('nations', NATIONS.join(',')).split(',');
const cadenceMinutes = Number(optionOf('cadence', 60));
const stepMinutes = Number(optionOf('pas', 5));
const durationHours = Number(optionOf('heures', 168));
const sampleHours = Number(optionOf('releve', 24));
const jobs = Number(optionOf('jobs', Math.max(1, Math.floor(availableParallelism() / 2))));
const out = optionOf('sortie', `${root}bots-serie`);
if (nations.length < 2 || nations.some((nation) => !NATIONS.includes(nation)))
  throw new Error(`--nations : deux au moins, parmi ${NATIONS.join(', ')}`);
for (const [name, value] of Object.entries({
  games,
  seed,
  cadenceMinutes,
  stepMinutes,
  durationHours,
  sampleHours,
  jobs,
}))
  if (!(value > 0)) throw new Error(`${name} doit être positif`);
mkdirSync(out, { recursive: true });

const fileOf = (k) => `${out}/partie-${seed + k}`;
function play(k) {
  const options = {
    seed: seed + k,
    nations,
    cadenceMinutes,
    stepMinutes,
    durationHours,
    sampleHours,
    out: fileOf(k),
  };
  return new Promise((done) => {
    const child = spawn('npx', ['vitest', 'run', '--project', 'simulation'], {
      cwd: root,
      env: { ...process.env, BOTS_SERIE: JSON.stringify(options) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    child.stdout.on('data', (chunk) => (log += chunk));
    child.stderr.on('data', (chunk) => (log += chunk));
    child.on('close', (code) => {
      writeFileSync(`${fileOf(k)}.log`, log);
      console.log(`partie ${seed + k} : ${code === 0 ? 'finie' : `en échec (${fileOf(k)}.log)`}`);
      done();
    });
  });
}

let next = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, games) }, async () => {
    while (next < games) await play(next++);
  }),
);

/* ---------- le résumé de la série ---------- */

const results = Array.from({ length: games }, (_, k) => `${fileOf(k)}.json`)
  .filter((file) => existsSync(file))
  .map((file) => JSON.parse(readFileSync(file, 'utf8')));
writeFileSync(`${out}/resume.md`, resumeOf(results));
console.log(`Résumé : ${out}/resume.md`);

function resumeOf(results) {
  const round = (value, digits = 1) => String(Math.round(value * 10 ** digits) / 10 ** digits);
  const table = (headers, rows) =>
    [
      `| ${headers.join(' | ')} |`,
      `|${headers.map(() => '---').join('|')}|`,
      ...rows.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n');
  const mean = (values) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  const lines = [
    '# Série de Mondiales de bots',
    `${results.length} partie(s) sur ${games}, germes ${seed} à ${seed + games - 1}. ` +
      `${nations.length} bots (${nations.join(', ')}), un passage toutes les ${cadenceMinutes} min ` +
      `de saison, horloge à ${durationHours} h.`,
    '> Des bots faciles ne mesurent pas l’équilibre entre humains : ils ne recherchent pas, ' +
      'n’élèvent pas et n’attaquent que pour défendre leur QG. Ce résumé dégrossit, il ne calibre pas.',
    '## Parties',
    table(
      ['Germe', 'Vainqueur', 'Par', 'Fin', 'Passages', 'Ordres refusés', 'Durée réelle'],
      results.map((r) => [
        r.seed,
        r.winnerNation ?? '—',
        r.reason ?? '—',
        r.endedAtHour === null ? '—' : `${round(r.endedAtHour)} h`,
        r.passes,
        r.refused.length,
        `${r.wallSeconds} s`,
      ]),
    ),
    '## Par nation',
    'Moyennes sur la série. Avant-postes : fondations levées, élévations achevées, debout à la fin ' +
      "(d'après le journal). Édition : la dernière du joueur (territoire, industrie, armée).",
    table(
      [
        'Nation',
        'Victoires',
        'Fondations',
        'Élévations',
        'Debout à la fin',
        'Territoire',
        'Industrie',
        'Armée',
        'Contacts subis',
        'Points tenus à la fin',
        'Heures de points',
      ],
      nations.map((nation) => {
        const of = (list) => list.filter((row) => row.nation === nation);
        const outposts = results.flatMap((r) => of(r.outposts));
        const editions = results.flatMap((r) => of(r.lastEdition));
        const isolation = results.flatMap((r) => of(r.isolation));
        return [
          nation,
          results.filter((r) => r.winnerNation === nation).length,
          round(mean(outposts.map((row) => row.founded))),
          round(mean(outposts.map((row) => row.raised))),
          round(mean(outposts.map((row) => row.standing))),
          round(mean(editions.map((row) => row.territory))),
          round(mean(editions.map((row) => row.industry))),
          round(mean(editions.map((row) => row.military))),
          round(mean(isolation.map((row) => row.suffered))),
          round(
            mean(results.map((r) => (r.points ?? []).filter((p) => p.holder === nation).length)),
          ),
          round(
            mean(
              results.map((r) =>
                (r.points ?? []).reduce((sum, p) => sum + (p.heldHours[nation] ?? 0), 0),
              ),
            ),
          ),
        ];
      }),
    ),
    '## Ordres joués',
    'Total sur la série, par mutation.',
    table(
      ['Ordre', 'Joués'],
      Object.entries(
        results.reduce((all, r) => {
          for (const [fn, count] of Object.entries(r.played)) all[fn] = (all[fn] ?? 0) + count;
          return all;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .map(([fn, count]) => [`\`${fn}\``, count]),
    ),
  ];
  const refusals = results.flatMap((r) => r.refused.map((line) => `- germe ${r.seed} : ${line}`));
  if (refusals.length > 0)
    lines.push(
      '## Ordres refusés',
      'Un ordre que le domaine offrait et que le serveur refuse est un écart (ADR 0042 §3).',
      refusals.slice(0, 40).join('\n'),
    );
  return `${lines.join('\n\n')}\n`;
}
