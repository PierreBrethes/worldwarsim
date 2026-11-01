import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { indexRowOf, longDate, sheetHtml, summaryOf, withRow } from './patchnote.mjs';

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
    expect(summary).toContain('À la une, la marche : Les colonnes marchent');
    for (const d of content.dispatches) expect(summary).toContain(`${d.kicker} : ${d.title}.`);
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
