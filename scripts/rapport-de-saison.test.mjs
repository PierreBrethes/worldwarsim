import { describe, expect, it } from 'vitest';
import { seasonReportOf } from '../src/domain/season-report.ts';
import { renderReport } from './rapport-de-saison.mjs';

const HOUR = 3_600_000;
const LAUNCH = 1_000 * HOUR;

const players = [
  { id: 'a', nation: 'usa', nickname: 'Alice' },
  { id: 'b', nation: 'germany', nickname: 'Bob' },
];

const render = (engagements = []) =>
  renderReport({
    code: 'TESTS1',
    launchedAt: LAUNCH,
    now: LAUNCH + 30 * HOUR,
    players,
    report: seasonReportOf({
      launchedAt: LAUNCH,
      now: LAUNCH + 30 * HOUR,
      stepHours: 24,
      bound: 150,
      players,
      editions: [
        { playerId: 'a', at: LAUNCH + 20 * HOUR, territory: 40, industry: 300, military: 100 },
        { playerId: 'b', at: LAUNCH + 20 * HOUR, territory: 60, industry: 100, military: 100 },
      ],
      troops: [{ playerId: 'a', place: 'building:1', where: 'home' }],
      queued: {},
      outposts: [{ playerId: 'b', at: LAUNCH + 5 * HOUR, kind: 'stands' }],
      engagements,
    }),
  });

describe('renderReport', () => {
  it('names each of the seven measures', () => {
    const markdown = render();
    for (const title of [
      'Boule de neige',
      'Tortue',
      "Tapis d'avant-postes",
      'Escouade monstre',
      'Charge',
      'Isolement',
      'Élever ou fonder',
    ]) {
      expect(markdown).toContain(title);
    }
  });

  it("puts the leader's shares in the snowball table", () => {
    expect(render()).toContain('| 24 h | 20 h | Alice (usa) | ×2 | 50 % | 75 % | 40 % |');
  });

  it('answers the United States question in a line, with and without contact', () => {
    expect(render()).toContain(
      '**États-Unis** : 0 engagement(s) subi(s), 0 donné(s), premier contact jamais.',
    );
    const fought = render([{ attackerId: 'b', defenderId: 'a', at: LAUNCH + 7 * HOUR }]);
    expect(fought).toContain('1 engagement(s) subi(s), 0 donné(s), premier contact à 7 h.');
  });
});
