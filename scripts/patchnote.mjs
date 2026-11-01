/**
 * La partie pure du bulletin des mises à jour : un contenu JSON devient la feuille A4 (HTML), son
 * résumé et sa ligne d'index. `generate-patchnote.mjs` la rend en WebP ; le gabarit CSS est
 * `patchnote.css`, le contenu type `patchnote-exemple/2026-11-01.json`.
 *
 * Contenu : { date, from, dispatchCount, lead: { kicker, title, chapo, images: [{ src, alt,
 * caption }, ×2], bullets: [{ text, refs }] }, dispatches: [{ kicker, title, image: { src, alt,
 * caption }, text, refs }, ×2 ou 3], also: [{ text, refs }], bench: { image?, entries: [{ title,
 * text }, ×1 ou 2] } }. `date` (AAAA-MM-JJ) est le jour de l'édition, `from` le début de la période ;
 * le jour de la semaine se calcule, jamais écrit.
 */

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const partsOf = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
};

/** « 1er novembre » (en texte) ou `1<sup>er</sup> novembre` (en HTML). */
const dayMonth = (iso, html) => {
  const { month, day } = partsOf(iso);
  const ord = day === 1 ? (html ? '<sup>er</sup>' : 'er') : '';
  return `${day}${ord} ${MONTHS[month - 1]}`;
};

/** Les familles de la feuille : le rendu refuse de sortir si l'une ne s'est pas chargée. */
export const FONT_FAMILIES = ['Archivo Narrow', 'Bodoni Moda', 'IBM Plex Mono', 'Source Serif 4'];

/** Le nom du jeu est `fr.masthead` (src/i18n/fr.ts), que Node ne charge pas : `patchnote.test.mjs` garde cette copie. */
const MASTHEAD = { article: 'la', word: 'Manchette', title: 'La Manchette' };

const capital = (word) => word[0].toUpperCase() + word.slice(1);

/** « dimanche 1er novembre », le jour de la semaine tiré de la date. */
export const longDate = (iso, html = false) =>
  `${DAYS[partsOf(iso).weekday]} ${dayMonth(iso, html)}`;

const periodOf = (content, html) =>
  `du ${dayMonth(content.from, html)} au ${dayMonth(content.date, html)}`;

const esc = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

const refsOf = (refs = []) =>
  refs.length ? ` <span class="ref">${refs.map((n) => `#${esc(n)}`).join(' ')}</span>` : '';

const figure = ({ src, alt, caption }, images) =>
  `<figure><img src="${esc(images[src] ?? src)}" alt="${esc(alt)}">${
    caption ? `<figcaption>${esc(caption)}</figcaption>` : ''
  }</figure>`;

const story = (d, images, tall) => `
        <article class="story${tall ? ' tall' : ''}">
          <div class="kicker">${esc(d.kicker)}</div>
          <h2>${esc(d.title)}</h2>
          ${figure(d.image, images)}
          <p>${esc(d.text)}${refsOf(d.refs)}</p>
        </article>`;

/**
 * La feuille en HTML. `images` donne, par chemin du contenu, l'adresse servie de l'image
 * (une URL `data:` au rendu) ; un chemin absent est laissé tel quel.
 */
export const sheetHtml = (content, css, images = {}) => {
  const { lead, dispatches, also, bench } = content;
  const split = dispatches.length - 1;
  const first = dispatches.slice(0, split);
  const last = dispatches[split];
  const [a, b] = lead.images;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Bulletin du ${esc(dayMonth(content.date))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@500;600;700&family=Bodoni+Moda:ital,opsz,wght@0,6..96,500..800;1,6..96,500..700&family=IBM+Plex+Mono:wght@400;500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400..600;1,8..60,400&display=swap">
<style>${css}</style></head><body>
<main class="sheet" aria-label="Bulletin des mises à jour de ${MASTHEAD.title}">
  <div class="inner">
    <header class="mast">
      <div class="left"><b>Bulletin des mises à jour</b><br>Mondiale · édition de guerre</div>
      <div>
        <div class="title"><i>${MASTHEAD.article}</i>${MASTHEAD.word}</div>
        <div class="dateline">Ce qui a changé sur la carte, ${periodOf(content, true)}</div>
      </div>
      <div class="right"><b>${capital(longDate(content.date, true))}</b><br>${esc(content.dispatchCount)} dépêches au front</div>
    </header>

    <div class="stamp" aria-hidden="true"><div>MIS<br>À JOUR<small>${String(partsOf(content.date).day).padStart(2, '0')} · ${String(partsOf(content.date).month).padStart(2, '0')}</small></div></div>

    <section class="body">
      <article class="col lead">
        <div>
          <div class="kicker">À la une · ${esc(lead.kicker)}</div>
          <h2>${esc(lead.title)}</h2>
          <p class="chapo">${esc(lead.chapo)}</p>
        </div>
        <div class="pair">
          ${figure(a, images)}
          ${figure(b, images)}
        </div>
        <ul class="bullets">
${lead.bullets.map((x) => `          <li>${esc(x.text)}${refsOf(x.refs)}</li>`).join('\n')}
        </ul>
      </article>

      <div class="col">${first.map((d) => story(d, images, first.length === 1)).join('')}
      </div>

      <div class="col">${story(last, images, true)}
        <div class="box">
          <h3>Et aussi</h3>
          <ul>
${also.map((x) => `            <li>${refsOf(x.refs).trim() || '<span></span>'}<span>${esc(x.text)}</span></li>`).join('\n')}
          </ul>
        </div>
      </div>
    </section>

    <footer class="foot"${bench.image ? '' : ' style="grid-template-columns: auto 1fr 1fr"'}>
      <div class="tag">Sur l'établi</div>${bench.image ? `\n      ${figure(bench.image, images)}` : ''}
${bench.entries
  .map(
    (e) => `      <div>
        <h4>${esc(e.title)}</h4>
        <p>${esc(e.text)}</p>
      </div>`,
  )
  .join('\n')}
    </footer>
  </div>
</main>
</body></html>
`;
};

const lowerFirst = (text) => text[0].toLowerCase() + text.slice(1);
const sentence = (text) => (/[.!?…]$/.test(text) ? text : `${text}.`);

/** Ce que dit la feuille en texte : son texte alternatif, et sous elle au téléphone. */
export const summaryOf = (content) => {
  const { lead, dispatches, also, bench } = content;
  const captions = lead.images.map((i) => i.caption).filter(Boolean);
  const parts = [
    `Bulletin des mises à jour, ${longDate(content.date)}, édition de guerre de la Mondiale : ce qui a changé sur la carte, ${periodOf(content, false)}.`,
    `À la une, ${lead.kicker} : ${lowerFirst(lead.title)}.`,
    sentence(lead.chapo),
    ...captions.map(sentence),
    ...lead.bullets.map((x) => sentence(x.text)),
    ...dispatches.flatMap((d) => [
      `${d.kicker} : ${lowerFirst(d.title)}.`,
      ...(d.image.caption ? [sentence(d.image.caption)] : []),
      sentence(d.text),
    ]),
    `Et aussi : ${also.map((x) => x.text.replace(/[.]$/, '')).join(' ; ')}.`,
    `Sur l'établi : ${bench.entries.map((e) => `${e.title.toLowerCase()}, ${e.text}`.replace(/[.]$/, '')).join(' ; ')}.`,
  ];
  return parts.join(' ');
};

/** La ligne d'index d'un bulletin ; la date est le nom des fichiers. */
export const indexRowOf = (content) => ({
  date: content.date,
  title: content.lead.title,
  image: `/patchnotes/${content.date}.webp`,
  thumb: `/patchnotes/${content.date}-thumb.webp`,
  summary: summaryOf(content),
});

/** L'index avec cette ligne ajoutée, ou remplaçant celle de la même date ; le plus récent en tête. */
export const withRow = (index, row) =>
  [...index.filter((r) => r.date !== row.date), row].sort((x, y) => y.date.localeCompare(x.date));

/** Les arguments de `generate-patchnote.mjs` : le contenu, et `--a-blanc <feuille.webp>` ; sinon un refus. */
export const argsOf = (argv) => {
  const usage = 'Usage : generate-patchnote.mjs <contenu.json> [--a-blanc <feuille.webp>]';
  const blank = argv.indexOf('--a-blanc');
  if (blank >= 0 && (argv[blank + 1] === undefined || argv[blank + 1].startsWith('--')))
    return { refusal: usage };
  const stray = argv.find((arg) => arg.startsWith('--') && arg !== '--a-blanc');
  if (stray) return { refusal: `Option inconnue : ${stray}. ${usage}` };
  const rest = argv.filter((_, k) => (k !== blank && k !== blank + 1) || blank < 0);
  if (rest.length !== 1) return { refusal: usage };
  return { contentPath: rest[0], blankPath: blank < 0 ? null : argv[blank + 1] };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE_EXTENSION = /\.(jpg|jpeg|png|webp)$/;
const isCount = (n) => Number.isInteger(n) && n >= 0;

/**
 * Ce qui, dans un contenu, ferait mal rendre, ou écrire hors de `public/patchnotes/` (la date est
 * un nom de fichier) : le premier champ fautif, nommé, ou `null`. `srcExists` dit si une image existe.
 */
export const contentRefusalOf = (content, srcExists) => {
  if (!DATE.test(content.date ?? '')) return 'date : AAAA-MM-JJ attendu';
  if (!DATE.test(content.from ?? '')) return 'from : AAAA-MM-JJ attendu';
  if (content.from > content.date) return 'from : doit précéder date';
  if (!isCount(content.dispatchCount)) return 'dispatchCount : entier attendu';
  const { lead, dispatches, also, bench } = content;
  if (lead?.images?.length !== 2) return 'lead.images : exactement 2 images';
  if (![2, 3].includes(dispatches?.length)) return 'dispatches : 2 ou 3 dépêches';
  if (![1, 2].includes(bench?.entries?.length)) return 'bench.entries : 1 ou 2 entrées';
  const lists = {
    'lead.bullets': lead.bullets,
    also,
    ...Object.fromEntries(dispatches.map((d, k) => [`dispatches[${k}]`, [d]])),
  };
  for (const [field, rows] of Object.entries(lists))
    for (const row of rows ?? [])
      if (!(row.refs ?? []).every(isCount)) return `${field}.refs : numéros entiers attendus`;
  const images = [
    ...lead.images,
    ...dispatches.map((d) => d.image),
    ...(bench.image ? [bench.image] : []),
  ];
  for (const { src } of images) {
    if (typeof src !== 'string' || !IMAGE_EXTENSION.test(src))
      return `image ${src} : extension jpg, jpeg, png ou webp (minuscules) attendue`;
    if (!srcExists(src)) return `image ${src} : fichier introuvable`;
  }
  return null;
};
