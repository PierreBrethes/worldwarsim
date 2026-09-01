/**
 * Les quatre planches de la modale de site sont la même page à quatre états : un artboard ne
 * partage rien avec ses voisins, donc on les écrit d'ici plutôt que de maintenir quatre copies
 * qui divergeraient au premier ajustement de gouttière.
 *
 * Toute chaîne et tout chiffre viennent de `WWS/docs/design/contrats-de-vue/03-caserne-donnees.md`
 * et de `src/i18n/fr.ts` ; rien n'est écrit ici.
 */
import { writeFileSync } from 'node:fs';

const INK = '#2a2118';
const INK_SOFT = '#5f5039';
const INK_QUIET = '#4a4436';
const PAPER = '#e4d8bd';
const CRITICAL = '#9d4638';
const DESK = '#0f0a04';
const RULE_LIGHT = 'rgba(42,33,24,.16)';
const RULE_MEDIUM = 'rgba(42,33,24,.35)';
const DISPLAY = "'Bodoni Moda', Georgia, serif";
const BODY = "'Archivo Narrow', 'Arial Narrow', sans-serif";
const MONO = "'IBM Plex Mono', monospace";
const SPRITE_INK = 'saturate(.5) sepia(.22) brightness(.94)';

const eyebrow = (text, color = INK_SOFT) =>
  `<span style="font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:${color}">${text}</span>`;

const rule = () => `<span style="flex:1;height:1px;background:rgba(42,33,24,.2)"></span>`;

const button = (label, { disabled = false } = {}) =>
  `<button type="button"${disabled ? ' disabled="disabled"' : ''} style="font-family:${BODY};cursor:${
    disabled ? 'not-allowed' : 'pointer'
  };background:transparent;border:1px solid ${INK};padding:5px 10px;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${INK};opacity:${
    disabled ? '.35' : '1'
  }">${label}</button>`;

/** Les silhouettes de `src/emblems/ResourceIcon.tsx`, reprises trait pour trait. */
const RESOURCE_PATH = {
  alloy: 'M9.4 5.6h5.2l2.4 6.4H7zM4.4 12h5.2l2.4 6.4H2zM14.4 12h5.2l2.4 6.4H12z',
  food: 'M12 3c1.4 0 2.4.8 2.4 1.8 0 .5-.2.9-.6 1.3 3.1 1.2 5.2 4 5.2 7.6V21H5v-7.3c0-3.6 2.1-6.4 5.2-7.6-.4-.4-.6-.8-.6-1.3C9.6 3.8 10.6 3 12 3z',
};
const RESOURCE_INK = { alloy: '#627584', food: '#6a7047' };

const expense = (resource, value, stock) =>
  `<span style="display:flex;align-items:center;gap:4px">` +
  `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" style="display:block;fill:${RESOURCE_INK[resource]}"><path d="${RESOURCE_PATH[resource]}"></path></svg>` +
  `<span style="font-family:${MONO};font-size:13.5px;color:${INK}">${value} / ${stock}</span>` +
  `</span>`;

/** Le cachet de `src/shell/Stamp.tsx` : l'inclinaison est tirée du texte, jamais du rendu. */
const tiltOf = (label) => {
  const hash = [...label].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 7);
  const tenths = (hash % 20) - 10;
  return (tenths < 0 ? tenths : tenths + 1) / 10;
};

const stamp = (label) =>
  `<span style="display:inline-block;flex-shrink:0;white-space:nowrap;text-transform:uppercase;color:${INK};border:1.5px solid currentColor;transform:rotate(${tiltOf(
    label,
  )}deg);font-family:${DISPLAY};font-weight:700;font-size:9px;letter-spacing:.2em;line-height:1;padding:3px 6px 2px 7px">${label}</span>`;

/** Élévation de CE bâtiment, sur sa ligne d'en-tête — `UpgradeControl`, coûts collés au stock. */
const upgradeLine = (observer) =>
  observer
    ? ''
    : `<div style="display:flex;align-items:center;gap:10px">
            ${expense('alloy', 72, 320)}
            ${expense('food', 54, 114)}
            <span style="font-family:${MONO};font-size:11.5px;color:${INK_SOFT}">1 h 12</span>
            <span style="font-family:${MONO};font-size:11px;color:${INK_QUIET}">→ niveau 2</span>
            ${button('améliorer')}
          </div>`;

const pips = () => {
  const cells = [];
  for (let index = 0; index < 10; index += 1) {
    const fill =
      index < 3 ? INK : index < 5 ? 'rgba(42,33,24,.35)' : 'transparent';
    cells.push(
      `<span style="height:20px;width:10px;border:1px solid ${INK};background:${fill}"></span>`,
    );
  }
  return `<span style="display:flex;align-items:center;gap:3px">${cells.join(
    '',
  )}<span style="margin-left:8px">${eyebrow('plafond 10 troupes')}</span></span>`;
};

/** Une carte de rôle, telle que la v1 la dessine : la vignette en vedette, les chiffres dessous. */
const roleCard = ({ role, sprite, equipment, tiers, cost, minutes, strength, unit, sheet, inService, locked, observer }) => `
              <div style="display:flex;flex-direction:column;border-right:1px solid ${RULE_LIGHT};border-bottom:1px solid ${RULE_LIGHT}">
                <div style="position:relative;display:flex;height:150px;align-items:center;justify-content:center;border-bottom:1px solid ${RULE_LIGHT};background:rgba(42,33,24,.05)">
                  <img src="${sprite}" alt="" style="display:block;height:132px;width:230px;object-fit:contain;filter:${SPRITE_INK}">
                  ${
                    tiers === 2
                      ? `<div style="position:absolute;top:8px;left:8px;display:flex;gap:2px">
                    <span style="border:1px solid ${INK};background:${INK};color:${PAPER};padding:3px 5px;font-family:${MONO};font-size:9.5px;line-height:1">MK1</span>
                    <span style="border:1px solid ${INK};background:${PAPER};color:${INK};padding:3px 5px;font-family:${MONO};font-size:9.5px;line-height:1;opacity:.35">MK2</span>
                  </div>`
                      : ''
                  }
                  <span style="position:absolute;top:8px;right:8px;display:flex;align-items:baseline;gap:5px">
                    <span style="font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:${INK_SOFT}">en service</span>
                    <span style="font-family:${MONO};font-size:14px;color:${INK}">${inService}</span>
                  </span>
                </div>
                <div style="padding:10px 16px 8px">
                  <div style="font-family:${DISPLAY};font-size:19px;line-height:1.1;font-weight:800;color:${INK}">${role}</div>
                  ${equipment ? `<div style="margin-top:2px;font-size:12.5px;color:${INK_SOFT}">${equipment}</div>` : ''}
                  ${locked ? `<div style="margin-top:6px">${stamp(locked)}</div>` : ''}
                </div>
                <div style="display:flex;align-items:stretch;margin:0 16px;border-top:1px solid ${RULE_LIGHT};border-bottom:1px solid ${RULE_LIGHT}">
                  <div style="flex:1;padding:7px 0">
                    <div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${INK_QUIET}">coût</div>
                    <div style="display:flex;gap:11px;margin-top:3px">${expense('alloy', cost, 320)}</div>
                  </div>
                  <div style="width:1px;background:${RULE_LIGHT}"></div>
                  <div style="flex:1;padding:7px 0 7px 12px">
                    <div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:${INK_QUIET}">formation</div>
                    <div style="display:flex;align-items:baseline;gap:9px;margin-top:3px">
                      <span style="font-family:${MONO};font-size:13.5px;color:${INK}">${minutes}</span>
                      <span style="font-family:${MONO};font-size:13.5px;color:${INK}">${strength}</span>
                      <span style="font-size:10.5px;color:${INK_SOFT}">${unit}</span>
                    </div>
                  </div>
                </div>
                <div style="flex:1;padding:9px 16px 0">${sheet}</div>
                ${
                  observer
                    ? '<div style="padding:0 16px 14px"></div>'
                    : `<div style="padding:12px 16px 14px">${
                        locked
                          ? `<span style="display:block;width:100%;box-sizing:border-box;text-align:center;border:1px solid rgba(42,33,24,.35);padding:8px 0;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(42,33,24,.35)">+ 1 troupe</span>`
                          : `<span style="display:block;width:100%;box-sizing:border-box;text-align:center;border:1px solid ${INK};padding:8px 0;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${INK}">+ 1 troupe</span>`
                      }</div>`
                }
              </div>`;

const combatSheet = (strong, weak) => `
                  <div style="font-size:12.5px;line-height:1.5">
                    <div><span style="color:${INK_SOFT}">fort contre </span><span style="color:${INK}">${strong}</span></div>
                    <div><span style="color:${INK_SOFT}">faible contre </span><span style="color:${INK}">${weak}</span></div>
                  </div>`;

const supportSheet = (contribution) => `
                  <p style="margin:0;font-size:12.5px;line-height:1.5;color:${INK_SOFT};font-style:italic">${contribution} Ne combat pas, mais peut se faire détruire ou intercepter.</p>`;

const CARDS = (observer) => [
  roleCard({
    role: 'infanterie',
    sprite: 'infantry-1.webp',
    equipment: 'soldat',
    tiers: 2,
    cost: 18,
    minutes: '20 min',
    strength: 50,
    unit: 'soldats',
    sheet: combatSheet('garnisons, avant-postes', 'blindé, bombardier'),
    inService: 3,
    locked: null,
    observer,
  }),
  roleCard({
    role: 'blindé',
    sprite: 'armor-1.webp',
    equipment: 'char léger R35',
    tiers: 2,
    cost: 95,
    minutes: '1 h 10',
    strength: 12,
    unit: 'chars',
    sheet: combatSheet('infanterie, garnisons', 'bombardier, infanterie MK2'),
    inService: 0,
    locked: 'verrouillé — quartier général niveau 2 requis',
    observer,
  }),
  roleCard({
    role: 'transport terrestre',
    sprite: 'landTransport.webp',
    equipment: 'VTC',
    tiers: 1,
    cost: 40,
    minutes: '45 min',
    strength: 24,
    unit: 'camions',
    sheet: supportSheet('Ajoute de la capacité de pile : projette l’infanterie plus loin.'),
    inService: 0,
    locked: null,
    observer,
  }),
];

const checkbox = (on) =>
  `<span style="display:flex;height:13px;width:13px;flex-shrink:0;align-items:center;justify-content:center;border:1px solid ${INK};font-size:9px;line-height:1;background:${
    on ? INK : 'transparent'
  };color:${on ? PAPER : 'transparent'}">×</span>`;

const garrisonRow = ({ sprite, role, tier, strength, unit, supplied, checked, observer }) => `
                <div style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid ${RULE_LIGHT}">
                  ${observer ? '' : checkbox(checked)}
                  <img src="${sprite}" alt="" style="display:block;height:28px;width:40px;object-fit:contain;filter:${SPRITE_INK}">
                  <span style="flex:1;min-width:0">
                    <span style="display:block;font-size:13px;font-weight:700;color:${INK}">${role}</span>
                    <span style="display:block;font-family:${MONO};font-size:10.5px;color:${INK_SOFT}">${tier} — effectif ${strength} ${unit}</span>
                  </span>
                  <span style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${
                    supplied ? INK_SOFT : CRITICAL
                  }">${supplied ? 'ravitaillée' : 'hors ravitaillement — entretien ×2'}</span>
                </div>`;

const garrisonSection = ({ empty, observer }) => `
            <section style="border-top:1px solid ${RULE_MEDIUM}">
              <div style="display:flex;align-items:center;gap:12px;padding:9px 16px;border-bottom:1px solid ${RULE_MEDIUM}">
                ${eyebrow('garnison')}
                ${rule()}
                ${eyebrow(empty ? '0 troupe' : '3 troupes')}
              </div>
              ${
                empty
                  ? `<p style="margin:0;padding:18px 16px;font-size:12.5px;color:${INK_SOFT}">Aucune troupe ne stationne ici.</p>`
                  : [
                      garrisonRow({
                        sprite: 'infantry-1.webp',
                        role: 'infanterie',
                        tier: 'MK1',
                        strength: '32 / 50',
                        unit: 'soldats',
                        supplied: true,
                        checked: true,
                        observer,
                      }),
                      garrisonRow({
                        sprite: 'infantry-1.webp',
                        role: 'infanterie',
                        tier: 'MK1',
                        strength: '50 / 50',
                        unit: 'soldats',
                        supplied: true,
                        checked: false,
                        observer,
                      }),
                      garrisonRow({
                        sprite: 'landTransport.webp',
                        role: 'transport terrestre',
                        tier: 'MK1',
                        strength: '24 / 24',
                        unit: 'camions',
                        supplied: true,
                        checked: true,
                        observer,
                      }),
                    ].join('')
              }
              ${
                empty || observer
                  ? ''
                  : `<div style="display:flex;align-items:center;gap:12px;padding:10px 16px">
                <span style="font-size:12.5px;color:${INK}">pile : 2 troupes · 1 slot</span>
                <span style="font-size:11.5px;color:${INK_SOFT}">colonne motorisée</span>
                ${rule()}
                ${button('préparer un mouvement')}
              </div>`
              }
            </section>`;

const queueRow = ({ role, tier, strength, unit, state, left, cancellable, observer, title }) => `
              <div${title ? ` title="${title}"` : ''} style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid ${RULE_LIGHT}">
                <img src="infantry-1.webp" alt="" style="display:block;height:26px;width:38px;object-fit:contain;filter:${SPRITE_INK}">
                <span style="flex:1;min-width:0">
                  <span style="display:block;font-size:12.5px;color:${INK}">${role} <span style="font-family:${MONO};font-size:11px;color:${INK_SOFT}">${tier} — ${strength} ${unit}</span></span>
                  <span style="display:block;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${INK_SOFT}">${state}</span>
                </span>
                <span style="flex-shrink:0;font-family:${MONO};font-size:12.5px;color:${INK}">${left}</span>
                ${cancellable && !observer ? button('annuler') : ''}
              </div>`;

const queueAside = ({ empty, observer }) => `
          <aside style="display:flex;width:300px;flex:0 0 300px;flex-direction:column;border-left:1px solid ${RULE_MEDIUM}">
            <div style="padding:10px 16px;border-bottom:1px solid ${RULE_MEDIUM}">${eyebrow('files de production')}</div>
            ${
              empty
                ? `<p style="margin:0;padding:20px 16px;font-size:12.5px;color:${INK_SOFT}">Aucune troupe en chaîne. Choisissez un site et enfilez un rôle.</p>`
                : `<div style="padding:5px 16px;border-bottom:1px solid ${RULE_MEDIUM};background:rgba(42,33,24,.05)">${eyebrow(
                    'Normandie — 2 lots en file sur 12',
                  )}</div>
            ${queueRow({
              role: 'infanterie',
              tier: 'MK1',
              strength: 50,
              unit: 'soldats',
              state: 'en chaîne',
              left: '12 min',
              cancellable: false,
              observer,
              title: 'une troupe commencée ne s’annule plus',
            })}
            ${queueRow({
              role: 'infanterie',
              tier: 'MK1',
              strength: 50,
              unit: 'soldats',
              state: 'en attente',
              left: '20 min',
              cancellable: true,
              observer,
              title: 'annuler et rembourser',
            })}`
            }
            <div style="margin-top:auto;padding:12px 16px 20px;border-top:1px solid ${RULE_MEDIUM}">
              ${eyebrow('au réveil')}
              <p style="margin:4px 0 0;font-size:11.5px;line-height:1.5;color:${INK_SOFT}">Les files continuent pendant la plage de repos, comme les chantiers. Chaque bâtiment tient sa propre file : une seconde caserne forme en parallèle. Une troupe déjà commencée ne s’annule plus ; les suivantes sont remboursées intégralement.</p>
            </div>
          </aside>`;

const page = ({ queueEmpty = false, garrisonEmpty = false, observer = false } = {}) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,700;6..96,800&family=Archivo+Narrow:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
  <style>
    body { margin: 0; background: ${DESK}; font-family: ${BODY}; }
    a { color: #3f5a7d; } a:hover { color: ${INK}; }
    /* La trame de demi-teinte de toute surface de papier — src/styles/index.css. */
    .paper-grain {
      background-color: ${PAPER};
      background-image: repeating-linear-gradient(45deg, rgba(42,33,24,.055) 0 1px, transparent 1px 5px);
    }
  </style>
</helmet>
<div style="padding:24px">
  <article class="paper-grain" style="display:flex;width:1180px;flex-direction:column;border:1px solid ${INK};color:${INK}">

    <div style="display:flex;align-items:center;gap:12px;border-bottom:1px solid ${INK};padding:10px 16px">
      <img src="barracks.webp" alt="" style="display:block;height:26px;width:auto;object-fit:contain">
      <span style="font-family:${DISPLAY};font-size:19px;line-height:1.1;font-weight:800;color:${INK}">Caserne</span>
      <span style="font-size:12px;color:${INK_SOFT}">en Normandie · niveau 1</span>
      ${rule()}
      ${upgradeLine(observer)}
      ${button('fermer')}
    </div>

    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;border-bottom:1px solid ${RULE_MEDIUM};padding:9px 16px">
      <span style="display:flex;align-items:baseline;gap:9px">
        <span style="font-family:${MONO};font-size:19px;color:${INK}">3</span>
        ${eyebrow('en service')}
        <span style="margin-left:8px;font-family:${MONO};font-size:19px;color:${INK}">${queueEmpty ? 0 : 2}</span>
        ${eyebrow('en file')}
      </span>
      ${pips()}
      ${rule()}
      <span style="max-width:40ch;text-align:right;font-size:11.5px;line-height:1.4;color:${INK_SOFT};font-style:italic">Les hommes ne sont pas une ressource : une troupe coûte des matières, et l’armée est bornée en nombre de troupes par les baraquements. La file compte dans le plafond.</span>
    </div>

    <div style="display:flex;align-items:stretch">
      <div style="display:flex;min-width:0;flex:1;flex-direction:column">
        <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr))">${CARDS(observer).join('')}
        </div>
${garrisonSection({ empty: garrisonEmpty, observer })}
      </div>
${queueAside({ empty: queueEmpty, observer })}
    </div>

    <div style="display:flex;align-items:center;gap:10px;border-top:1px solid ${INK};padding:10px 16px">
      <span style="display:inline-flex;align-items:center;border:1px solid ${INK};padding:3px 5px;color:${INK}">
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" style="display:block">
          <g fill="currentColor"><rect x="0.5" y="0.5" width="3" height="3"></rect><rect x="4.5" y="4.5" width="3" height="3"></rect><rect x="8.5" y="0.5" width="3" height="3"></rect></g>
          <g fill="currentColor" opacity="0.35"><rect x="4.5" y="0.5" width="3" height="3"></rect><rect x="0.5" y="4.5" width="3" height="3"></rect><rect x="8.5" y="8.5" width="3" height="3"></rect></g>
          <g fill="none" stroke="currentColor" stroke-width="0.7" opacity="0.55"><rect x="0.85" y="8.85" width="2.3" height="2.3"></rect><rect x="4.85" y="8.85" width="2.3" height="2.3"></rect><rect x="8.85" y="4.85" width="2.3" height="2.3"></rect></g>
        </svg>
      </span>
      <span style="font-size:11.5px;color:${INK_SOFT}">abaque de tir — qui bat qui</span>
      ${rule()}
    </div>

  </article>
</div>
</x-dc>
</body>
</html>
`;

const here = new URL('.', import.meta.url);
const write = (name, html) => writeFileSync(new URL(name, here), html);

write('Main.dc.html', page());
write('FileVide.dc.html', page({ queueEmpty: true }));
write('GarnisonVide.dc.html', page({ garrisonEmpty: true }));
write('Observateur.dc.html', page({ observer: true }));

console.log('4 planches écrites');
