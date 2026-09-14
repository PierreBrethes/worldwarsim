/**
 * `rapport.html` — the same numbers `run.mjs` prints, in a shape a human reads in one pass.
 *
 * **One file, nothing fetched.** It opens on `file://` from a USB stick with no server, no
 * network and no dependency: the data is inlined, the charts are hand-written SVG. Anything
 * loaded at display time would make the report a thing that can fail to open, and a measurement
 * nobody can open is a measurement nobody reads.
 *
 * It is written, never committed (`.gitignore`): it is a view of the last run, and a view has no
 * business drifting from the run it shows.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { RESOURCES } from './constants.mjs';

const PAPER = '#f2ece0';
const INK = '#23201b';
const FAINT = '#b9ae98';
const SERIES = ['#8c3b2e', '#3a5a72', '#6a6b3c'];

const escape = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}h${String(Math.round(m % 60)).padStart(2, '0')}`;

/* ── 1. the frieze of connections ───────────────────────────────────────── */

/** A cell per connection, hollow when the player found nothing to do. The ink says how much;
 *  the hole says the failure this whole instrument exists to count. */
function frieze(runs) {
  const cell = 15;
  const gap = 3;
  const rowHeight = 34;
  const labelWidth = 110;
  const widest = Math.max(...Object.values(runs).map((r) => r.sessions.length));
  const width = labelWidth + widest * (cell + gap);
  const rows = Object.values(runs).map((r, index) => {
    const y = index * rowHeight;
    const cells = r.sessions.map((session, i) => {
      const x = labelWidth + i * (cell + gap);
      const shade = session.actions === 0
        ? `fill="none" stroke="${FAINT}" stroke-dasharray="2 2"`
        : `fill="${SERIES[0]}" fill-opacity="${Math.min(1, 0.25 + session.actions * 0.13)}" stroke="none"`;
      return `<rect x="${x}" y="${y + 8}" width="${cell}" height="${cell}" rx="2" ${shade}>`
        + `<title>${escape(hm(session.minute))} — ${session.actions} action(s), file ${session.queueDepth}</title></rect>`;
    }).join('');
    return `<text x="0" y="${y + 20}" font-size="12" fill="${INK}">${escape(r.profileName)}</text>${cells}`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${Object.keys(runs).length * rowHeight + 8}" width="100%">${rows}</svg>`;
}

/* ── 2. the grid, one curve per foundry ─────────────────────────────────── */

function panel(rows, metric, extraction, profile, foundries, packs, ceiling) {
  const w = 210;
  const h = 140;
  const left = 30;
  const bottom = 24;
  const x = (pack) => left + ((pack - packs[0]) / (packs[packs.length - 1] - packs[0])) * (w - left - 10);
  const y = (value) => h - bottom - (value / ceiling) * (h - bottom - 12);

  const axes = `<line x1="${left}" y1="${h - bottom}" x2="${w - 6}" y2="${h - bottom}" stroke="${FAINT}"/>`
    + `<line x1="${left}" y1="10" x2="${left}" y2="${h - bottom}" stroke="${FAINT}"/>`
    + `<text x="${left - 4}" y="${h - bottom + 3}" font-size="9" text-anchor="end" fill="${FAINT}">0</text>`
    + `<text x="${left - 4}" y="16" font-size="9" text-anchor="end" fill="${FAINT}">${ceiling}</text>`
    + packs.map((pack) => `<text x="${x(pack)}" y="${h - 8}" font-size="9" text-anchor="middle" fill="${FAINT}">${pack}</text>`).join('');

  const curves = foundries.map((foundry, index) => {
    const points = packs.map((pack) => {
      const row = rows.find((candidate) => candidate.foundry === foundry
        && candidate.extraction === extraction && candidate.pack === pack
        && candidate.profile === profile);
      return row ? `${x(pack)},${y(metric(row))}` : null;
    }).filter(Boolean);
    if (points.length === 0) return '';
    const dots = points.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.5" fill="${SERIES[index]}"/>`).join('');
    return `<polyline points="${points.join(' ')}" fill="none" stroke="${SERIES[index]}" stroke-width="1.6"/>${dots}`;
  }).join('');

  return `<figure><svg viewBox="0 0 ${w} ${h}" width="${w}">${axes}${curves}</svg>`
    + `<figcaption>extraction ×${extraction.toFixed(1)} · ${escape(profile)}</figcaption></figure>`;
}

function gridCharts(rows) {
  if (rows.length === 0) {
    return '<p class="absent">Aucune grille sur le disque. <code>node run.mjs --grille</code> en écrit une.</p>';
  }
  const foundries = [...new Set(rows.map((r) => r.foundry))].sort((a, b) => a - b);
  const extractions = [...new Set(rows.map((r) => r.extraction))].sort((a, b) => a - b);
  const packs = [...new Set(rows.map((r) => r.pack))].sort((a, b) => a - b);
  const profiles = [...new Set(rows.map((r) => r.profile))];

  const legend = foundries.map((foundry, index) =>
    `<span class="key"><i style="background:${SERIES[index]}"></i>fonderie ${foundry}/h</span>`).join('');

  const block = (title, metric, ceiling) => `<h3>${title}</h3><div class="panels">`
    + profiles.flatMap((profile) => extractions.map((extraction) =>
      panel(rows, metric, extraction, profile, foundries, packs, ceiling))).join('')
    + '</div>';

  const maxActions = Math.ceil(Math.max(...rows.map((r) => r.actions)) / 10) * 10;
  const maxDead = Math.max(...rows.map((r) => r.dead));
  return `<p class="legend">${legend} — pack de départ en abscisse.</p>`
    + block('Actions sur la saison', (r) => r.actions, maxActions)
    + block('Connexions vides', (r) => r.dead, maxDead || 1);
}

/* ── 3. what is left at the end, and what the ceiling threw away ────────── */

function remainders(runs) {
  const profiles = Object.values(runs);
  const ceiling = Math.max(1, ...profiles.flatMap((r) => RESOURCES.map((k) => r.stocks[k])));
  const w = 24;
  const gap = 6;
  const group = profiles.length * (w + 2) + gap * 4;
  const height = 190;
  const bars = RESOURCES.flatMap((resource, column) => profiles.map((r, index) => {
    const x = column * group + index * (w + 2);
    const value = r.stocks[resource];
    const barHeight = (value / ceiling) * (height - 50);
    const lost = r.capped[resource] > 0;
    const hatch = lost ? ' fill="url(#perte)" stroke="' + SERIES[0] + '"' : ` fill="${SERIES[index]}" fill-opacity="0.75"`;
    return `<rect x="${x}" y="${height - 30 - barHeight}" width="${w}" height="${barHeight}"${hatch}>`
      + `<title>${escape(r.profileName)} — ${resource} ${value}`
      + `${lost ? ` (plafond atteint, ${r.capped[resource]} perdus)` : ''}</title></rect>`;
  })).join('');
  const labels = RESOURCES.map((resource, column) =>
    `<text x="${column * group + (profiles.length * (w + 2)) / 2}" y="${height - 14}" font-size="10"`
    + ` text-anchor="middle" fill="${INK}">${resource}</text>`).join('');
  const legend = profiles.map((r, index) =>
    `<span class="key"><i style="background:${SERIES[index]}"></i>${escape(r.profileName)}</span>`).join('');
  return `<p class="legend">${legend}<span class="key"><i class="hatched"></i>plafond atteint — perte, pas reste</span></p>`
    + `<svg viewBox="0 0 ${RESOURCES.length * group} ${height}" width="100%">`
    + `<defs><pattern id="perte" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">`
    + `<line x1="0" y1="0" x2="0" y2="5" stroke="${SERIES[0]}" stroke-width="2.5"/></pattern></defs>`
    + `<line x1="0" y1="${height - 30}" x2="${RESOURCES.length * group}" y2="${height - 30}" stroke="${FAINT}"/>`
    + `${bars}${labels}</svg>`;
}

/* ── the page ───────────────────────────────────────────────────────────── */

const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0 auto; max-width: 62rem; padding: 2rem 1.5rem 4rem;
         background: ${PAPER}; color: ${INK};
         font: 15px/1.55 "Iowan Old Style", "Palatino Linotype", Georgia, serif; }
  h1 { font-size: 1.6rem; margin: 0 0 .2rem; letter-spacing: .02em; }
  h2 { font-size: 1.15rem; margin: 2.6rem 0 .3rem; border-bottom: 1px solid ${FAINT}; padding-bottom: .25rem; }
  h3 { font-size: .95rem; margin: 1.4rem 0 .4rem; font-weight: 600; }
  p.sub, p.legend, figcaption, p.absent { font-size: .8rem; color: #6a6155; }
  p.legend { display: flex; flex-wrap: wrap; gap: .9rem; align-items: center; }
  .key { display: inline-flex; align-items: center; gap: .35rem; }
  .key i { width: .8rem; height: .8rem; display: inline-block; border-radius: 2px; }
  .key i.hatched { background: repeating-linear-gradient(45deg, ${SERIES[0]} 0 2px, transparent 2px 5px);
                   border: 1px solid ${SERIES[0]}; }
  .panels { display: flex; flex-wrap: wrap; gap: .6rem 1rem; }
  figure { margin: 0; }
  figcaption { text-align: center; margin-top: -.4rem; }
  table { border-collapse: collapse; font-size: .82rem; margin-top: .6rem; }
  th, td { padding: .16rem .55rem; text-align: right; border-bottom: 1px solid rgba(0,0,0,.07); }
  th:first-child, td:first-child { text-align: left; }
  code { font-size: .85em; }
`;

function summaryTable(runs) {
  const head = ['profil', 'actions', 'connexions', 'vides', 'file méd.', 'QG', 'troupes', 'bâtiments']
    .map((h) => `<th>${h}</th>`).join('');
  const body = Object.values(runs).map((r) => `<tr><td>${escape(r.profileName)}</td>`
    + `<td>${r.totalActions}</td><td>${r.sessions.length}</td>`
    + `<td>${r.deadSessions}</td><td>${r.medianQueue}</td><td>n.${r.finalHq}</td>`
    + `<td>${r.troops}/${r.troopCap}</td><td>${r.sites}</td></tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function writeReport(runs) {
  const gridPath = new URL('./grille.json', import.meta.url);
  const rows = existsSync(gridPath) ? JSON.parse(readFileSync(gridPath, 'utf8')) : [];

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulateur d'ouverture — rapport</title>
<style>${STYLE}</style></head><body>
<h1>Simulateur d'ouverture</h1>
<p class="sub">Campagne, 168 h, sol de référence (France). Un instrument de mesure, pas un
prototype : rien ici ne dit qui gagne.</p>

<h2>La frise des connexions</h2>
<p class="sub">Une case par connexion, du plus clair au plus dense. Une case creuse est une
connexion vide — le joueur est venu et il n'y avait rien à faire.</p>
${frieze(runs)}
${summaryTable(runs)}

<h2>Ce que déplacent la fonderie, l'extraction et le pack</h2>
${gridCharts(rows)}

<h2>Ce qui dort en fin de saison</h2>
<p class="sub">Un stock que le plafond a refusé n'est pas un reste, c'est une perte : les barres
hachurées ont buté sur <code>STORAGE_CAP_PER_LEVEL</code>.</p>
${remainders(runs)}

<script type="application/json" id="donnees">${JSON.stringify({
    runs: Object.fromEntries(Object.entries(runs).map(([key, r]) => [key, { ...r, log: undefined, series: undefined }])),
    grille: rows,
  }).replace(/</g, '\\u003c')}</script>
</body></html>`;

  const out = new URL('./rapport.html', import.meta.url);
  writeFileSync(out, html);
  return 'rapport.html';
}
