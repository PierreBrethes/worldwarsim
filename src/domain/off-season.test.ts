import { describe, expect, it } from 'vitest';
import { destinationOf, invitationUrl, joinRefusalOf, normalizeGameCode } from './off-season';

/**
 * **Une règle de refus, lue par l'écran et par le serveur** (ADR 0015) : l'ordre est celui que
 * `join` tenait déjà — la place d'abord, parce que celui qui l'a la garde et qu'on ne lui dit pas
 * de la chercher ailleurs ; puis la saison close, la fenêtre, la nation, le salon plein.
 */
describe('joinRefusalOf', () => {
  const open = { seated: false, status: 'lobby' as const, seats: 2, maximum: 8 };

  it('lets in an open lobby', () => {
    expect(joinRefusalOf(open)).toBeNull();
  });

  it('shuts a Mondiale at its launch: nobody enters after the start (ADR 0027 §4)', () => {
    expect(joinRefusalOf({ ...open, status: 'launched' })).toBe('REGISTRATION_CLOSED');
  });

  it('shuts a Blitz at its launch: everybody is there, nobody arrives late (E4)', () => {
    expect(joinRefusalOf({ ...open, status: 'launched', mode: 'blitz' })).toBe('BLITZ_STARTED');
  });

  it('names the Blitz ceiling apart from a full Mondiale lobby', () => {
    expect(joinRefusalOf({ ...open, seats: 4, maximum: 4, mode: 'blitz' })).toBe('BLITZ_FULL');
    expect(joinRefusalOf({ ...open, seats: 4, maximum: 4 })).toBe('LOBBY_FULL');
  });

  it('refuses a concluded season and a full lobby', () => {
    expect(joinRefusalOf({ ...open, status: 'concluded' })).toBe('SEASON_CONCLUDED');
    expect(joinRefusalOf({ ...open, seats: 8 })).toBe('LOBBY_FULL');
  });

  it('keeps the order: a held seat first, then the end of the season, then the start', () => {
    const everything = { ...open, seated: true, status: 'concluded' as const, seats: 8 };
    expect(joinRefusalOf(everything)).toBe('SEAT_TAKEN');
    expect(joinRefusalOf({ ...everything, seated: false })).toBe('SEASON_CONCLUDED');
    expect(joinRefusalOf({ ...everything, seated: false, status: 'launched' })).toBe(
      'REGISTRATION_CLOSED',
    );
  });
});

describe('normalizeGameCode', () => {
  it('trims and upper-cases, so a link typed by hand lands on the same season', () => {
    expect(normalizeGameCode('k7q2px ')).toBe('K7Q2PX');
    expect(normalizeGameCode('K7Q2PX')).toBe('K7Q2PX');
  });

  it('answers nothing for a character the alphabet never draws, or a wrong length', () => {
    expect(normalizeGameCode('K7Q2P0')).toBeNull();
    expect(normalizeGameCode('K7Q2PI')).toBeNull();
    expect(normalizeGameCode('K7Q2P')).toBeNull();
    expect(normalizeGameCode('')).toBeNull();
  });
});

describe('invitationUrl', () => {
  it('is the origin the player is on, never an address written here', () => {
    expect(invitationUrl('https://example.test', 'K7Q2PX')).toBe(
      'https://example.test/rejoindre/K7Q2PX',
    );
  });
});

describe('destinationOf', () => {
  it('sends a lobby to the lobby, and a running or concluded season to the board', () => {
    expect(destinationOf({ status: 'lobby' })).toBe('salon');
    expect(destinationOf({ status: 'launched' })).toBe('plateau');
    expect(destinationOf({ status: 'concluded' })).toBe('plateau');
  });
});
