/**
 * Collects the `@a-mesurer` markers of `convex/` and `src/domain/` into
 * `WWS/docs/technique/a-mesurer.md` — the measuring sheet of the rebuilt simulator.
 *
 * A marker is one line inside the comment of a constant:
 *
 * ```ts
 * /** @a-mesurer no measurement whatsoever; nothing simulates interception *\/
 * export const INTERCEPTION_RADIUS_KM = 200;
 * ```
 *
 * It attaches to the run of `export const` declarations that immediately follows, so two
 * placeholders written as a pair (`OUTPOST_DISABLED_HOURS` and its immunity) share one marker
 * and one reason. A marker with no reason, or with no constant under it, fails the run: an
 * unreadable marker is a constant that would silently leave the register.
 *
 * **No clock, and no `HEAD` either.** The header carries a fingerprint of the collected rows,
 * not the current commit: the file has to be identical for identical sources, and a `HEAD`
 * short hash would go stale on the very commit that writes it — the freshness test would then
 * fail after every commit of the repository, whatever it touched.
 *
 * Usage: node scripts/generate-a-mesurer.mjs
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCANNED = ['convex', 'src/domain'];
export const REGISTER_PATH = 'WWS/docs/technique/a-mesurer.md';

const MARKER = /@a-mesurer\b(.*)$/;
const DECLARATION = /^export const (\w+)/;

function sourceFiles(directory) {
  const absolute = join(ROOT, directory);
  return readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .filter((entry) => !entry.name.endsWith('.test.ts'))
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).split('\\').join('/'))
    .sort();
}

const isComment = (line) => {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
};

/** The declaration may span lines; it ends where its braces close on a `;`. */
function readDeclaration(lines, start) {
  let text = '';
  for (let i = start; i < lines.length; i++) {
    text += (text === '' ? '' : ' ') + lines[i].trim();
    const depth = [...text].reduce(
      (level, character) => level + (character === '{' ? 1 : 0) - (character === '}' ? 1 : 0),
      0,
    );
    if (depth === 0 && text.endsWith(';')) return { text, end: i };
  }
  return null;
}

/** What the constant is worth today, written as the source writes it, on one line. */
function valueOf(declaration) {
  const equals = declaration.indexOf('=');
  return declaration
    .slice(equals + 1, -1)
    .replace(/\s+/g, ' ')
    .replace(/,\s*}/g, ' }')
    .trim();
}

export function collectMarkers() {
  const rows = [];
  for (const directory of SCANNED) {
    for (const file of sourceFiles(directory)) {
      const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const marked = MARKER.exec(lines[i]);
        if (marked === null) continue;
        const reason = marked[1]
          .replace(/\*\/\s*$/, '')
          .replace(/^[\s—:-]+/, '')
          .trim();
        if (reason === '') throw new Error(`${file}:${i + 1} — @a-mesurer without a reason`);

        let line = i + 1;
        while (line < lines.length && (isComment(lines[line]) || lines[line].trim() === '*/')) {
          line++;
        }
        const before = rows.length;
        while (line < lines.length && DECLARATION.test(lines[line])) {
          const name = DECLARATION.exec(lines[line])[1];
          const declaration = readDeclaration(lines, line);
          if (declaration === null) {
            throw new Error(`${file}:${line + 1} — ${name} never closes its declaration`);
          }
          rows.push({
            name,
            value: valueOf(declaration.text),
            where: `${file}:${line + 1}`,
            reason,
          });
          line = declaration.end + 1;
        }
        if (rows.length === before) {
          throw new Error(`${file}:${i + 1} — @a-mesurer names no constant under it`);
        }
      }
    }
  }
  return rows;
}

const cell = (text) => text.replace(/\|/g, '\\|');

export function renderRegister(rows) {
  const fingerprint = createHash('sha256')
    .update(rows.map((row) => `${row.name}|${row.value}|${row.where}|${row.reason}`).join('\n'))
    .digest('hex')
    .slice(0, 7);

  return [
    `<!-- Généré par \`node scripts/generate-a-mesurer.mjs\` depuis les marqueurs \`@a-mesurer\` — ne pas éditer à la main. Empreinte du contenu source : ${fingerprint} -->`,
    '',
    '# Les constantes à mesurer',
    '',
    'Une ligne de ce registre est **une valeur en attente de son instrument** : posée pour que la',
    'règle existe et se lise, jamais pour équilibrer quoi que ce soit. Ni une dette, ni un TODO —',
    '`WWS/QUESTIONS.md` porte les questions, les prompts portent le travail. Quand le simulateur en',
    'mesure une, on retire son marqueur et la ligne disparaît à la régénération : le registre a',
    'vocation à se vider, et sa taille mesure la dette de calibrage.',
    '',
    `${rows.length} valeurs marquées dans \`convex/\` et \`src/domain/\`.`,
    '',
    "**Les tables économiques n'y figurent pas** — `BUILDING_SPEC`, `COST_BY_ROLE`,",
    "`EXTRACTION_PER_HOUR`, `CHAINS` et leurs voisines : leur instrument existe déjà, c'est le",
    "simulateur d'ouverture (`WWS/simulation/opening/`), et l'en-tête de `convex/constants.ts` les",
    'déclare placeholders en bloc. Le registre sert les valeurs que rien ne mesure encore.',
    '',
    '| Constante | Valeur | Où | Pourquoi elle attend |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| \`${cell(row.name)}\` | \`${cell(row.value)}\` | \`${cell(row.where)}\` | ${cell(row.reason)} |`,
    ),
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = collectMarkers();
  writeFileSync(join(ROOT, REGISTER_PATH), renderRegister(rows));
  console.log(`${rows.length} constantes à mesurer → ${REGISTER_PATH}`);
}
