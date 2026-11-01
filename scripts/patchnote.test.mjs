import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fr } from '../src/i18n/fr';
import {
  argsOf,
  contentRefusalOf,
  indexRowOf,
  longDate,
  sheetHtml,
  summaryOf,
  withRow,
} from './patchnote.mjs';

const content = JSON.parse(
  readFileSync(new URL('./patchnote-exemple/2026-11-01.json', import.meta.url), 'utf8'),
);

describe('longDate', () => {
  it('tire le jour de la semaine de la date', () => {
    expect(longDate('2026-11-01')).toBe('dimanche 1er novembre');
    expect(longDate('2026-11-08')).toBe('dimanche 8 novembre');
    expect(longDate('2026-12-31')).toBe('jeudi 31 décembre');
  });
});

describe('summaryOf', () => {
  const summary = summaryOf(content);
  it('ouvre sur l’édition et la période', () => {
    expect(summary).toMatch(
      /^Bulletin des mises à jour, dimanche 1er novembre, .* du 30 octobre au 1er novembre\./,
    );
  });
  it('dit la une, chaque dépêche, « Et aussi » et l’établi, sans numéros d’issue', () => {
    expect(summary).toContain('À la une, la marche : les colonnes marchent');
    for (const d of content.dispatches)
      expect(summary).toContain(`${d.kicker} : ${d.title[0].toLowerCase()}${d.title.slice(1)}.`);
    expect(summary).toContain('Et aussi : Lâcher une troupe');
    expect(summary).toContain("Sur l'établi : chaque bâtiment sur son socle");
    expect(summary).not.toMatch(/#\d/);
  });
});

describe('indexRowOf', () => {
  it('nomme les fichiers d’après la date', () => {
    expect(indexRowOf(content)).toMatchObject({
      date: '2026-11-01',
      title: content.lead.title,
      image: '/patchnotes/2026-11-01.webp',
      thumb: '/patchnotes/2026-11-01-thumb.webp',
    });
  });
});

describe('withRow', () => {
  const row = (date, title) => ({ date, title, image: '', thumb: '', summary: '' });
  it('remplace la ligne de la même date et garde le plus récent en tête', () => {
    const index = [row('2026-11-08', 'b'), row('2026-11-01', 'ancien')];
    expect(withRow(index, row('2026-11-01', 'neuf')).map((r) => r.title)).toEqual(['b', 'neuf']);
    expect(withRow(index, row('2026-11-15', 'c')).map((r) => r.date)).toEqual([
      '2026-11-15',
      '2026-11-08',
      '2026-11-01',
    ]);
  });
});

describe('sheetHtml', () => {
  it('compose la feuille : jour calculé, tampon, compte, images et références', () => {
    const html = sheetHtml(content, '', { 'img/file.jpg': 'data:x' });
    expect(html).toContain('<b>Dimanche 1<sup>er</sup> novembre</b><br>16 dépêches au front');
    expect(html).toContain('<small>01 · 11</small>');
    expect(html).toContain('<span class="ref">#272 #327 #331 #332</span>');
    expect(html).toContain('src="data:x"');
    expect(html.match(/<article class="story/g)).toHaveLength(3);
  });
  it('échappe le texte et se passe de l’image de l’établi', () => {
    const html = sheetHtml(
      { ...content, lead: { ...content.lead, title: 'A <b> & B' }, bench: { entries: [] } },
      '',
    );
    expect(html).toContain('A &lt;b&gt; &amp; B');
    expect(html).toContain('grid-template-columns: auto 1fr 1fr');
  });
});

describe('the masthead', () => {
  it('reads the name the game displays (`fr.masthead`), which this Node script cannot import', () => {
    const html = sheetHtml(content, '');
    expect(html).toContain(`<i>${fr.masthead.article}</i>${fr.masthead.word}`);
    expect(html).toContain(`aria-label="Bulletin des mises à jour de ${fr.masthead.title}"`);
  });
});

describe('argsOf', () => {
  it('takes the content first or last, with or without --a-blanc', () => {
    expect(argsOf(['c.json'])).toEqual({ contentPath: 'c.json', blankPath: null });
    expect(argsOf(['c.json', '--a-blanc', 'f.webp'])).toEqual({
      contentPath: 'c.json',
      blankPath: 'f.webp',
    });
    expect(argsOf(['--a-blanc', 'f.webp', 'c.json'])).toEqual({
      contentPath: 'c.json',
      blankPath: 'f.webp',
    });
  });
  it('refuses a missing content, a missing blank path and a stray option', () => {
    expect(argsOf([]).refusal).toMatch(/Usage/);
    expect(argsOf(['c.json', '--a-blanc']).refusal).toMatch(/Usage/);
    expect(argsOf(['c.json', '--blanc']).refusal).toMatch(/--blanc/);
  });
});

describe('contentRefusalOf', () => {
  const present = () => true;
  const refusal = (change, exists = present) =>
    contentRefusalOf(structuredClone({ ...content, ...change }), exists);
  it('accepts the example', () => {
    expect(contentRefusalOf(content, present)).toBeNull();
  });
  it('names the date when it could leave public/patchnotes/', () => {
    expect(refusal({ date: '../../src/x' })).toMatch(/date/);
    expect(refusal({ from: '30/10/2026' })).toMatch(/from/);
    expect(refusal({ from: '2026-11-02' })).toMatch(/from/);
  });
  it('counts images, dispatches and bench entries', () => {
    expect(refusal({ lead: { ...content.lead, images: [content.lead.images[0]] } })).toMatch(
      /lead\.images/,
    );
    expect(refusal({ dispatches: content.dispatches.slice(0, 1) })).toMatch(/dispatches/);
    expect(refusal({ bench: { entries: [] } })).toMatch(/bench\.entries/);
  });
  it('wants whole numbers for the count and the issue numbers', () => {
    expect(refusal({ dispatchCount: '16' })).toMatch(/dispatchCount/);
    expect(refusal({ also: [{ text: 'x', refs: ['<b>'] }] })).toMatch(/also/);
  });
  it('wants every image to exist, with a known lowercase extension', () => {
    expect(refusal({}, (src) => src !== 'img/nuit.jpg')).toMatch(/img\/nuit\.jpg/);
    const lead = structuredClone(content.lead);
    lead.images[0].src = 'img/FILE.JPG';
    expect(refusal({ lead })).toMatch(/FILE\.JPG/);
  });
});

describe('escaping', () => {
  it('escapes the issue numbers and the count too', () => {
    const html = sheetHtml({ ...content, dispatchCount: '<i>' }, '');
    expect(html).toContain('&lt;i&gt; dépêches');
  });
});
