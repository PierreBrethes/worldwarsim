/**
 * **L'état de référence, exporté d'une saison réellement jouée** (décision de Pierre, 06/09).
 *
 * Il n'y a plus de simulateur derrière ce document : `dev.snapshot` sert la vue d'un joueur —
 * `playerView` et `control.held`, brouillard appliqué — et ce fichier la met en Markdown. La
 * règle des contrats de vue tient donc jusqu'au document : **ce qui n'est pas servi n'apparaît
 * pas**, aucune section n'invente une valeur, et chaque titre nomme le champ dont il sort. Un
 * chiffre qui manque au rendu manque à la vue, ce qui est exactement l'information qu'un lecteur
 * de design vient chercher.
 *
 *     node scripts/exporter-etat-reference.mjs --token=… --saison=…   # interroge le backend
 *     node scripts/exporter-etat-reference.mjs                        # rend le Markdown du JSON
 *
 * Le jeton est celui d'une **session** et la saison celle de la place à lire (ADR 0022) — les
 * deux se prennent dans le `localStorage` du joueur, `wws-session` et `wws-season`. `npx convex
 * run` parle au déploiement configuré du dépôt, donc c'est bien la saison en cours qui sort.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const JSON_PATH = 'WWS/simulation/etat-reference.json';
export const MARKDOWN_PATH = 'WWS/simulation/ETAT-REFERENCE.md';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * `npx convex run` écrit ses journaux avant le résultat : on repart de la première accolade et
 * on lit jusqu'au bout. Un parseur plus malin lirait moins de choses.
 */
export function parseRun(stdout) {
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(`aucun JSON dans la sortie de convex run :\n${stdout}`);
  return JSON.parse(stdout.slice(start));
}

function fetchSnapshot(token, seasonId) {
  const stdout = execFileSync(
    'npx',
    ['convex', 'run', 'dev:snapshot', JSON.stringify({ token, seasonId })],
    { cwd: root, encoding: 'utf8' },
  );
  return parseRun(stdout);
}

/* ---------- composition ---------- */

const DASH = '—';

/** Une décimale au plus, et jamais un `.0` : les débits sortent d'un règlement, pas d'une table. */
const num = (value) =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);

/** Les instants sont rendus en heures depuis `loadedAt` — négatif dans le passé. Une date en
 *  clair serait une chaîne que la vue n'a jamais servie, et le document ne s'autorise que ce
 *  qu'elle sert. */
const hoursFrom = (at, now) =>
  at === null || at === undefined ? DASH : num((at - now) / 3_600_000);

const cell = (value) => {
  if (value === null || value === undefined || value === '') return DASH;
  if (typeof value === 'number') return num(value);
  if (Array.isArray(value)) return value.map(cell).join(' ');
  if (typeof value === 'object') return Object.values(value).map(cell).join(' ');
  return String(value).replaceAll('|', '\\|');
};

const table = (headers, rows) => {
  if (rows.length === 0) return `*aucune ligne servie.*\n`;
  const head = `| ${headers.join(' | ')} |`;
  const rule = `|${headers.map(() => '---').join('|')}|`;
  const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
  return [head, rule, ...body].join('\n') + '\n';
};

/** Le tableau clé/valeur d'un objet plat : une ligne par champ servi, dans l'ordre du contrat. */
const fields = (object, keys) =>
  table(
    ['champ', 'valeur'],
    keys.map((key) => [key, object?.[key]]),
  );

/** Les colonnes d'un tableau se déduisent des lignes elles-mêmes, à plat : une dépêche porte les
 *  champs de son `kind` et rien d'autre, et une colonne inventée serait un champ de plus que la
 *  vue ne sert pas. */
function flatTable(rows, { drop = [] } = {}) {
  const flat = rows.map((row) => flatten(row, drop));
  const headers = [...new Set(flat.flatMap((row) => Object.keys(row)))];
  return table(
    headers,
    flat.map((row) => headers.map((header) => row[header])),
  );
}

function flatten(value, drop, prefix = '') {
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (drop.includes(key)) continue;
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(out, flatten(nested, drop, path));
    } else {
      out[path] = nested;
    }
  }
  return out;
}

/** L'adresse d'une troupe, telle que `stationedAt` la sert — le discriminant et son identifiant,
 *  jamais un nom de lieu que la vue n'aurait pas donné. */
const addressOf = (station) =>
  station.kind === 'building'
    ? `building ${station.buildingId}`
    : station.kind === 'outpost'
      ? `outpost ${station.outpostId}`
      : station.kind === 'point'
        ? `point ${cell(station.lonLat)} ${cell(station.country)}`
        : 'home';

/* ---------- le document ---------- */

export function renderReference(snapshot) {
  const view = snapshot.playerView;
  const me = view.me;
  const now = view.loadedAt;
  const out = [];
  const say = (...lines) => out.push(...lines, '');

  say(
    '# État de référence',
    '',
    "La vue d'un joueur sur une saison **réellement jouée**, brouillard appliqué — telle que",
    '`dev.snapshot` la sert, sans rien y ajouter. Chaque section titre le champ de `playerView`',
    "dont elle sort ; **ce qui n'est pas servi n'apparaît pas**, et un chiffre absent d'ici est un",
    'chiffre absent de la vue. Le JSON brut est [`etat-reference.json`](etat-reference.json).',
    '',
    'Les instants sont comptés **en heures depuis `loadedAt`** — négatifs dans le passé. Les clés',
    "restent celles du code (le jeu, lui, s'affiche en français par `src/i18n/fr.ts`).",
  );

  say('---', '', '## La saison — `season`');
  say(
    fields(view.season, [
      'number',
      'durationHours',
      'elapsedHours',
      'players',
      'playableRegion',
      'travelMinutesPer1000km',
    ]),
  );

  say('### La domination — `season.reduction`');
  say(
    fields(view.season.reduction, ['target', 'winnerNation']),
    table(
      ['nation', 'nickname', 'isMine', 'isReduced', 'reduced'],
      view.season.reduction.standings.map((line) => [
        line.nation,
        line.nickname,
        line.isMine,
        line.isReduced,
        line.reduced,
      ]),
    ),
  );

  say('---', '', '## Le joueur — `me`');
  say(
    fields(me, [
      'nation',
      'creator',
      'defeated',
      'mayConclude',
      'ink',
      'progress',
      'hqLevel',
      'tier2HqLevel',
      'troopCap',
      'starving',
      'foundation',
      'recruiting',
    ]),
  );
  say('### La plage de repos — `me.restWindow`');
  say(fields(me.restWindow, ['startMinutes', 'endMinutes']));

  say('## Les ressources — `me.resources`');
  say(
    table(
      ['resource', 'stock', 'ratePerHour', 'cap'],
      Object.entries(me.resources).map(([key, row]) => [key, row.stock, row.ratePerHour, row.cap]),
    ),
  );

  say('### Les chaînes — `me.chains`');
  say(
    table(
      [
        'by',
        'output',
        'level',
        'perHour',
        'nominalPerHour',
        'state',
        'missing',
        'commanded',
        'order',
        'maxOrder',
      ],
      me.chains.map((chain) => [
        chain.by,
        chain.output,
        chain.level,
        chain.perHour,
        chain.nominalPerHour,
        chain.state,
        chain.missing,
        chain.commanded,
        chain.order,
        chain.maxOrder,
      ]),
    ),
  );

  say('### L’extraction — `me.extraction`');
  say(
    table(
      ['key', 'regionId', 'level', 'deposit', 'perHour'],
      me.extraction.map((site) => [
        site.key,
        site.regionId,
        site.level,
        site.deposit,
        site.perHour,
      ]),
    ),
  );

  say('### L’entretien — `me.upkeep`');
  say(
    fields(me.upkeep, [
      'troops',
      'unsupplied',
      'foodPerHour',
      'outposts',
      'outpostFoodPerHour',
      'outpostCoalPerHour',
    ]),
  );

  say('---', '', '## Les emplacements — `me.siteSlots`');
  say(
    table(
      ['outpostId', 'taken', 'total'],
      me.siteSlots.map((budget) => [budget.site.outpostId, budget.taken, budget.total]),
    ),
  );

  say(
    '## Les bâtiments, par site — `me.buildings`',
    '',
    'Le rattachement se lit sur `me.regions[].site` : `null` est le sol national, un identifiant',
    "est l'avant-poste qui porte la région.",
  );
  const siteOfRegion = new Map(view.me.regions.map((region) => [region.id, region.site]));
  const groups = new Map();
  for (const building of me.buildings) {
    const site = siteOfRegion.get(building.regionId) ?? null;
    const label = site === null ? DASH : (site.outpostId ?? 'home');
    groups.set(label, [...(groups.get(label) ?? []), building]);
  }
  for (const [label, buildings] of groups) {
    say(`### site \`${label}\``);
    say(
      table(
        ['key', 'regionId', 'level', 'point', 'cappedByHq'],
        buildings.map((building) => [
          building.key,
          building.regionId,
          building.level,
          building.point,
          building.cappedByHq,
        ]),
      ),
    );
  }

  say('### Le chantier — `me.construction`');
  say(
    me.construction === null
      ? '*aucun chantier en tête de file.*\n'
      : fields(me.construction, ['key', 'regionName', 'level', 'minutesLeft']),
  );

  say('### La file — `me.constructionQueue`');
  say(
    table(
      ['key', 'regionName', 'level'],
      me.constructionQueue.map((entry) => [entry.key, entry.regionName, entry.level]),
    ),
  );

  say('---', '', '## Les avant-postes — `me.outposts`');
  say(
    table(
      [
        'hostCountry',
        'regionId',
        'lonLat',
        'specialization',
        'level',
        'garrison',
        'disabledMinutesLeft',
      ],
      me.outposts.map((outpost) => [
        outpost.hostCountry,
        outpost.regionId,
        outpost.lonLat,
        outpost.specialization,
        outpost.level,
        outpost.garrison,
        outpost.disabledMinutesLeft,
      ]),
    ),
  );

  say(
    '## Les troupes, par adresse — `me.troops`',
    '',
    "L'adresse est `stationedAt`, servie telle quelle : une garnison se lit sur son avant-poste, une",
    'colonne posée sur son point.',
  );
  const byAddress = new Map();
  for (const troop of me.troops) {
    const address = addressOf(troop.stationedAt);
    byAddress.set(address, [...(byAddress.get(address) ?? []), troop]);
  }
  for (const [address, troops] of byAddress) {
    say(`### \`${address}\``);
    say(
      table(
        ['role', 'tier', 'strength', 'nominalStrength', 'supplied'],
        troops.map((troop) => [
          troop.role,
          troop.tier,
          troop.strength,
          troop.nominalStrength,
          troop.supplied,
        ]),
      ),
    );
  }

  say('### Ce qui est présent — `me.armyPresent`');
  say(table(['role', 'count'], Object.entries(me.armyPresent)));

  say('---', '', '## Les slots — `me.slots`');
  say(fields(me.slots, ['total', 'used']));

  say('## Les mouvements — `movements`');
  say(
    table(
      [
        'type',
        'originName',
        'destinationName',
        'distanceUnits',
        'costUnits',
        'landCost',
        'departedAt',
        'arrivesAt',
        'holdUntil',
      ],
      view.movements.map((movement) => [
        movement.type,
        movement.originName,
        movement.destinationName,
        movement.distanceUnits,
        movement.costUnits,
        movement.landCost,
        hoursFrom(movement.departedAt, now),
        hoursFrom(movement.arrivesAt, now),
        hoursFrom(movement.holdUntil, now),
      ]),
    ),
  );

  say('### Les piles en route — `movements[].roles`');
  say(
    table(
      ['type', 'role'],
      view.movements.flatMap((movement) => movement.roles.map((role) => [movement.type, role])),
    ),
  );

  say(
    '## Les relevés — `detected`',
    '',
    'Ni type, ni composition, ni nation : ces champs ne sont pas omis ici, ils ne sont pas servis',
    '(fiche 04, ADR 0019 §5).',
  );
  say(
    table(
      [
        'detector',
        'detectorRegion',
        'distanceUnits',
        'headingAtMe',
        'departedAt',
        'arrivesAt',
        'seenFrom',
        'seenTo',
      ],
      view.detected.map((arc) => [
        arc.detector,
        arc.detectorRegion,
        arc.distanceUnits,
        arc.headingAtMe,
        hoursFrom(arc.departedAt, now),
        hoursFrom(arc.arrivesAt, now),
        hoursFrom(arc.seenFrom, now),
        hoursFrom(arc.seenTo, now),
      ]),
    ),
  );

  say(
    '## La carte relevée — `control.held`',
    '',
    'Le dernier relevé du joueur, jamais la vérité (ADR 0020 §5) : `current` est couvert à',
    "l'instant, `surveyed` est une couleur datée qui peut être fausse.",
  );
  say(
    table(
      ['nickname', 'nation', 'ink', 'current', 'surveyed'],
      snapshot.control.map((holder) => [
        holder.nickname,
        holder.nation,
        holder.ink,
        holder.regions.filter((region) => region.state === 'current').length,
        holder.regions.filter((region) => region.state === 'surveyed').length,
      ]),
    ),
  );

  say(
    '## Les dépêches non lues — `notices`',
    '',
    '`journalReadAt` borne la lecture ; les colonnes sont celles des `kind` réellement déposés.',
  );
  const unread = view.notices.filter(
    (notice) => view.journalReadAt === null || notice.at > view.journalReadAt,
  );
  say(
    flatTable(
      unread.map((notice) => ({ ...notice, at: hoursFrom(notice.at, now) })),
      { drop: ['_id', '_creationTime', 'playerId', 'seasonId'] },
    ),
  );

  if (view.press !== null) {
    say('---', '', '## La presse — `press`');
    say(
      fields(
        { ...view.press, at: hoursFrom(view.press.at, now), next: hoursFrom(view.press.next, now) },
        ['at', 'next', 'final'],
      ),
    );
    if (view.press.mine !== null) {
      say('### Mes registres — `press.mine`');
      say(
        fields(view.press.mine, [
          'rank',
          'nickname',
          'nation',
          'territory',
          'industry',
          'military',
          'deeds',
          'general',
        ]),
      );
    }
    say(
      '### Le tableau — `press.others`',
      '',
      "Trois chiffres, et c'est structurel : ni `industry` ni `military` ne sortent du serveur pour",
      'un autre joueur (décision 80).',
    );
    say(
      table(
        ['rank', 'nickname', 'nation', 'territory', 'general', 'deeds', 'defeated'],
        view.press.others.map((line) => [
          line.rank,
          line.nickname,
          line.nation,
          line.territory,
          line.general,
          line.deeds,
          line.defeated,
        ]),
      ),
    );
  }

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
  const token = flag('token');
  const seasonId = flag('saison');
  if (token && !seasonId) throw new Error('--saison= manquant : une session ouvre une place');
  const snapshot = token
    ? fetchSnapshot(token, seasonId)
    : JSON.parse(readFileSync(root + JSON_PATH, 'utf8'));
  if (token) {
    writeFileSync(root + JSON_PATH, JSON.stringify(snapshot, null, 2) + '\n');
    console.log(`${JSON_PATH} écrit`);
  }
  writeFileSync(root + MARKDOWN_PATH, renderReference(snapshot));
  console.log(`${MARKDOWN_PATH} écrit`);
}
