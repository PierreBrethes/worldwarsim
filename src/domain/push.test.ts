import { describe, expect, it } from 'vitest';
import {
  IN_PLAY_WINDOW_MS,
  TELEGRAPH_PUSH_INTERVAL_MS,
  deviceLabelOf,
  groupAlarms,
  groupTelegraph,
  journalUrl,
  pushPreferencesOf,
  readSeat,
  reportUrl,
  telegraphUrl,
  type QueuedPush,
} from './push';

/** Une attaque porte l'adresse de sa dépêche, comme `convex/combat.ts` l'écrit ; le reste ouvre
 *  le journal. */
const row = (type: QueuedPush['type'], at: number, phrase = `phrase ${type}`): QueuedPush => ({
  type,
  at,
  phrase,
  label: phrase,
  url: type === 'attack' ? reportUrl(`engagement-${at}`) : journalUrl,
});

describe('pushPreferencesOf', () => {
  it('lit tout coché pour un compte qui n’a rien écrit', () => {
    expect(Object.values(pushPreferencesOf(undefined))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('garde ce que le compte a décoché', () => {
    expect(pushPreferencesOf({ sighting: false })).toMatchObject({ sighting: false, attack: true });
  });
});

describe('groupAlarms', () => {
  it('ne dit rien quand il n’y a que du télégraphe', () => {
    expect(groupAlarms([row('telegraph', 1)], 's1')).toBeNull();
  });

  it('envoie la phrase d’une attaque seule, vers sa dépêche', () => {
    expect(groupAlarms([row('attack', 1, 'une passe')], 's1')).toEqual({
      body: 'une passe',
      url: '/plateau?report=engagement-1',
      tag: 's1:alarms',
    });
  });

  it('envoie tout autre événement seul vers le journal', () => {
    expect(groupAlarms([row('dryFire', 1)], 's1')?.url).toBe(journalUrl);
  });

  it('résume plusieurs événements, et mène à la seule attaque du lot', () => {
    const grouped = groupAlarms([row('sighting', 3), row('attack', 1), row('outpost', 2)], 's1');
    expect(grouped?.body).toBe(
      '3 alarmes : une passe de résolution, un avant-poste désactivé ou détruit, une colonne relevée.',
    );
    expect(grouped?.url).toBe(reportUrl('engagement-1'));
  });

  it('compte les attaques groupées, et garde le journal', () => {
    const grouped = groupAlarms([row('attack', 1), row('attack', 2)], 's1');
    expect(grouped?.body).toBe('2 alarmes : 2 passes de résolution.');
    expect(grouped?.url).toBe(journalUrl);
  });

  it('ne glisse pas le télégraphe dans le résumé', () => {
    const grouped = groupAlarms([row('attack', 1), row('telegraph', 2), row('dryFire', 3)], 's1');
    expect(grouped?.body).toBe('2 alarmes : une passe de résolution, un tir à sec.');
  });
});

describe('groupTelegraph', () => {
  it('compte les messages et ouvre le télégraphe', () => {
    expect(groupTelegraph(3, 's1')).toEqual({
      body: '3 messages au télégraphe.',
      url: telegraphUrl,
      tag: 's1:telegraph',
    });
    expect(groupTelegraph(0, 's1')).toBeNull();
  });
});

describe('readSeat', () => {
  const NOON = Date.UTC(2026, 7, 17, 12, 0, 0);
  const NIGHT = Date.UTC(2026, 7, 17, 22, 0, 0);
  const rest = { startMinutes: 21 * 60, endMinutes: 4 * 60 };
  const seat = { presentAt: null, restWindow: rest, telegraphPushedAt: null };

  it('laisse tout partir en dehors du repos, absent', () => {
    expect(readSeat(seat, NOON)).toEqual({
      restUntil: null,
      inPlay: false,
      telegraphAllowed: true,
      telegraphRetryAt: null,
    });
  });

  it('donne la fin de la fenêtre pendant le repos', () => {
    expect(readSeat(seat, NIGHT).restUntil).toBe(Date.UTC(2026, 7, 18, 4, 0, 0));
  });

  it('est en jeu sous deux minutes de présence, pas au-delà', () => {
    expect(readSeat({ ...seat, presentAt: NOON - IN_PLAY_WINDOW_MS + 1 }, NOON).inPlay).toBe(true);
    expect(readSeat({ ...seat, presentAt: NOON - IN_PLAY_WINDOW_MS }, NOON).inPlay).toBe(false);
  });

  it('retient le télégraphe une heure', () => {
    const pushedAt = NOON - 10 * 60_000;
    expect(readSeat({ ...seat, telegraphPushedAt: pushedAt }, NOON)).toMatchObject({
      telegraphAllowed: false,
      telegraphRetryAt: pushedAt + TELEGRAPH_PUSH_INTERVAL_MS,
    });
  });
});

describe('deviceLabelOf', () => {
  it.each([
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36',
      'Chrome sur Android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari sur iPhone',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/127.0',
      'Firefox sur Mac',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0',
      'Edge sur Windows',
    ],
    ['', 'Appareil inconnu'],
  ])('reconnaît %#', (userAgent, label) => {
    expect(deviceLabelOf(userAgent)).toBe(label);
  });
});
