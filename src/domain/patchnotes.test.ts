import { describe, expect, it } from 'vitest';
import { limitOf, monthsOf, parsePatchnotes, turnOf, unreadOf } from './patchnotes';

const row = (date: string) => ({ date, title: `t ${date}`, image: `${date}.webp`, summary: 's' });

describe('l’index des bulletins', () => {
  it('range le plus récent d’abord et écarte ce qui n’est pas un bulletin', () => {
    const out = parsePatchnotes([row('2026-10-27'), { date: 'hier' }, row('2026-11-01'), 3]);
    expect(out.map((b) => b.date)).toEqual(['2026-11-01', '2026-10-27']);
  });

  it('ne rend rien d’un index illisible', () => {
    expect(parsePatchnotes({ not: 'a list' })).toEqual([]);
  });
});

describe('le non lu', () => {
  it('compte les bulletins dont la date n’a pas été lue', () => {
    const all = parsePatchnotes([row('2026-11-01'), row('2026-10-27')]);
    expect(unreadOf(all, new Set(['2026-10-27']))).toEqual(new Set(['2026-11-01']));
  });
});

describe('le sens du carrousel', () => {
  it('dit la limite au bout, jamais une flèche morte', () => {
    expect(limitOf(0, -1, 3)).toBe('first');
    expect(limitOf(2, 1, 3)).toBe('last');
    expect(limitOf(1, 1, 3)).toBeNull();
  });
});

describe('le tour de feuille suit le réglage des animations', () => {
  it('suit le doigt en 320 ms, fond en 140 ms, ou change d’un coup', () => {
    expect(turnOf('full')).toEqual({ kind: 'slide', ms: 320 });
    expect(turnOf('reduced')).toEqual({ kind: 'fade', ms: 140 });
    expect(turnOf('off')).toEqual({ kind: 'cut', ms: 0 });
  });
});

describe('la frise par mois', () => {
  it('groupe sans retourner l’ordre', () => {
    const all = parsePatchnotes([
      row('2026-11-01'),
      row('2026-10-27'),
      row('2026-10-23'),
      row('2026-09-30'),
    ]);
    expect(monthsOf(all.slice(1)).map(([month, rows]) => [month, rows.length])).toEqual([
      ['2026-10', 2],
      ['2026-09', 1],
    ]);
  });
});
