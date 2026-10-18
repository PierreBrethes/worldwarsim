/**
 * **Le rapport de fin de saison Mondiale** (ADR 0027 §7) : l'instrument d'équilibrage qui remplace
 * le simulateur. Il met en Markdown les cinq cas de casse du §5, l'isolement des États-Unis et
 * les élévations face aux fondations, joueur par joueur.
 *
 *     node scripts/rapport-de-saison.mjs                       # la dernière Mondiale lancée
 *     node scripts/rapport-de-saison.mjs --saison=PASKEM       # une saison par son code
 *     node scripts/rapport-de-saison.mjs --pas=12 > rapport.md # une ligne toutes les 12 h
 *
 * `npx convex run` parle au déploiement configuré du dépôt (`.env.local`). La lecture est
 * `convex/seasonReport.ts`, le calcul `src/domain/season-report.ts` (testé), et ce fichier ne
 * fait que mettre en page : il n'invente aucune valeur.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { seasonReportOf } from '../src/domain/season-report.ts';
import { parseRun } from './exporter-etat-reference.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

const run = (fn, args) =>
  parseRun(
    execFileSync('npx', ['convex', 'run', fn, JSON.stringify(args)], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );

/** Les dépêches d'avant-postes de chaque joueur, page après page. */
function readOutpostEvents(players) {
  const events = [];
  for (const { id, irregular } of players) {
    if (irregular) continue;
    let cursor = null;
    do {
      const page = run('seasonReport:outpostEvents', { playerId: id, cursor });
      events.push(...page.events);
      cursor = page.next;
    } while (cursor !== null);
  }
  return events;
}

/* ---------- mise en page ---------- */

const DASH = '—';
const round = (value, digits = 0) => {
  const scale = 10 ** digits;
  return String(Math.round(value * scale) / scale);
};
const hours = (value) => `${round(value, 1)} h`;

const table = (headers, rows) =>
  [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');

/** @param {{code: string, launchedAt: number, now: number, players: Array<{id: string, nation: string|null, nickname: string, irregular?: boolean}>, report: ReturnType<typeof seasonReportOf>}} data */
export function renderReport({ code, launchedAt, now, players, report }) {
  const real = players.filter((player) => !player.irregular);
  const label = (id) => {
    const player = players.find((candidate) => candidate.id === id);
    return player === undefined ? id : `${player.nickname} (${player.nation ?? DASH})`;
  };
  const out = [];
  const say = (...lines) => out.push(lines.join('\n\n'), '');

  say(
    `# Rapport de saison ${code}`,
    `Lancée le ${new Date(launchedAt).toISOString()}, lue à **${hours((now - launchedAt) / 3_600_000)}**. ` +
      `${real.length} joueurs : ${real.map((player) => label(player.id)).join(', ')}.`,
    'Seules les **éditions** et le **journal** forment une série dans le temps. Les troupes, leur ' +
      "place et les escouades ne sont gardées qu'à l'instant de la lecture : relancer le script " +
      'chaque jour donne la série qui manque.',
  );

  say(
    '## 1. Boule de neige',
    'Le premier est le plus haut `industry + military` des éditions (les deux chiffres du ' +
      "classement). `industry` est l'alliage payé en bâtiments et en points, **pas un débit** : la " +
      "production en flux n'est pas gardée. Les parts sont celles du premier dans le total des joueurs.",
    report.snowball.length === 0
      ? '*aucune édition à ces heures.*'
      : table(
          [
            'Heure',
            'Édition lue',
            'Premier',
            'Avance sur le second',
            'Armée',
            'Production',
            'Territoire',
          ],
          report.snowball.map((row) => [
            hours(row.hour),
            hours(row.edition),
            label(row.leaderId),
            row.lead === null ? DASH : `×${round(row.lead, 2)}`,
            `${round(row.army)} %`,
            `${round(row.production)} %`,
            `${round(row.territory)} %`,
          ]),
        ),
  );

  say(
    '## 2. Tortue',
    'Troupes par lieu de station à la lecture. Chez soi = le sol national, par le pays du point ' +
      "de station (bâtiment, avant-poste ou point isolé). Une colonne en marche n'est ni l'un ni l'autre.",
    table(
      ['Joueur', 'Troupes', 'Chez soi', 'À l’étranger', 'En marche', 'Part chez soi'],
      report.troops.map((row) => [
        label(row.playerId),
        row.total,
        row.home,
        row.abroad,
        row.marching,
        row.total === 0 ? DASH : `${round((row.home / row.total) * 100)} %`,
      ]),
    ),
  );

  say(
    "## 3. Tapis d'avant-postes",
    'Avant-postes debout par joueur à chaque heure, reconstitués depuis le journal (fondation levée, ' +
      'démantèlement, capture). « Sommet » est le plus haut atteint entre deux heures.',
    table(
      ['Joueur', ...report.marks.map(hours), 'Sommet'],
      report.outposts.map((row) => [label(row.playerId), ...row.series, row.peak]),
    ),
  );

  say(
    '## 4. Escouade monstre',
    "Une escouade est l'ensemble des troupes d'un joueur au même endroit (ou dans la même colonne). " +
      'Instant de la lecture.',
    table(
      ['Joueur', 'Plus grosse escouade', 'Où'],
      report.squads.map((row) => [
        label(row.playerId),
        row.largest,
        { home: 'chez soi', abroad: "à l'étranger", marching: 'en marche', null: DASH }[
          String(row.where)
        ],
      ]),
    ),
  );

  say(
    '## 5. Charge',
    'Pièces totales (troupes debout + file de recrutement) face à `MONDIALE_TROOP_BOUND`, la borne ' +
      "serveur. Instant de la lecture ; le sommet de la saison n'est pas gardé.",
    table(
      ['Joueur', 'Pièces', 'En file', 'Total', 'Borne', 'Part de la borne'],
      report.load.map((row) => [
        label(row.playerId),
        row.pieces,
        row.queued,
        row.pieces + row.queued,
        row.bound,
        `${round(((row.pieces + row.queued) / row.bound) * 100)} %`,
      ]),
    ),
  );

  say(
    '## 6. Isolement',
    'Engagements entre nations (les garnisons neutres à part). Le premier contact est compté en ' +
      'heures depuis le lancement.',
    table(
      ['Nation', 'Donnés', 'Subis', 'Contre les neutres', 'Premier contact', 'Contre qui'],
      report.isolation.map((row) => [
        row.nation,
        row.given,
        row.suffered,
        row.vsNeutral,
        row.firstContact === null ? DASH : hours(row.firstContact),
        Object.entries(row.against)
          .map(([nation, count]) => `${nation} ×${count}`)
          .join(', ') || DASH,
      ]),
    ),
  );
  const usa = report.isolation.find((row) => row.nation === 'usa');
  say(
    usa === undefined
      ? '**États-Unis** : pas de joueur américain dans cette saison.'
      : `**États-Unis** : ${usa.suffered} engagement(s) subi(s), ${usa.given} donné(s), premier ` +
          `contact ${usa.firstContact === null ? 'jamais' : `à ${hours(usa.firstContact)}`}.`,
  );

  say(
    '## 7. Élever ou fonder',
    "Fondations levées et élévations achevées, d'après le journal. Un point détruit avant le " +
      'chantier compte comme chantier mort ; les démantèlements et les captures sont donnés à côté.',
    table(
      [
        'Joueur',
        'Fondations',
        'Élévations',
        'Élévations / fondation',
        'Démantelés',
        'Pris',
        'Perdus',
        'Chantiers morts',
      ],
      report.outposts.map((row) => [
        label(row.playerId),
        row.founded,
        row.raised,
        row.founded === 0 ? DASH : round(row.raised / row.founded, 2),
        row.dismantled,
        row.captured,
        row.taken,
        row.lost,
      ]),
    ),
  );

  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

/* ---------- la ligne de commande ---------- */

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = (name) =>
    process.argv
      .slice(2)
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.slice(name.length + 3);
  const facts = run('seasonReport:facts', flag('saison') ? { code: flag('saison') } : {});
  const { code, ...input } = facts;
  const report = seasonReportOf({
    ...input,
    stepHours: Number(flag('pas') ?? 24),
    outposts: readOutpostEvents(input.players),
  });
  process.stdout.write(
    renderReport({
      code,
      launchedAt: input.launchedAt,
      now: input.now,
      players: input.players,
      report,
    }),
  );
}
