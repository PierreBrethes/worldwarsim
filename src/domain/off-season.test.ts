import { describe, expect, it } from 'vitest';
import {
  canJoinRegistration,
  destinationOf,
  invitationUrl,
  joinRefusalOf,
  normalizeGameCode,
  registrationDeadline,
} from './off-season';

describe('registration window', () => {
  it('keeps a pre-launch season open regardless of its creation age', () => {
    expect(canJoinRegistration('lobby', null, 99 * 3_600_000)).toBe(true);
  });

  it('uses an exact two-hour deadline, including a zero launch timestamp', () => {
    const deadline = 7_200_000;
    expect(registrationDeadline(0)).toBe(deadline);
    expect(canJoinRegistration('launched', 0, deadline - 1)).toBe(true);
    expect(canJoinRegistration('launched', 0, deadline)).toBe(false);
    expect(canJoinRegistration('launched', 0, deadline + 1)).toBe(false);
  });

  it('closes an inconsistent launched season without a launch timestamp', () => {
    expect(canJoinRegistration('launched', null, 0)).toBe(false);
  });

  it('keeps concluded seasons closed', () => {
    expect(canJoinRegistration('concluded', null, 0)).toBe(false);
  });
});

/**
 * **Une règle de refus, lue par l'écran et par le serveur** (ADR 0015) : l'ordre est celui que
 * `join` tenait déjà — la place d'abord, parce que celui qui l'a la garde et qu'on ne lui dit pas
 * de la chercher ailleurs ; puis la saison close, la fenêtre, la nation, le salon plein.
 */
describe('joinRefusalOf', () => {
  const open = {
    seated: false,
    status: 'lobby' as const,
    launchedAt: null,
    now: 0,
    seats: 2,
    freeNations: 6,
    maximum: 8,
  };

  it('lets in an open lobby', () => {
    expect(joinRefusalOf(open)).toBeNull();
  });

  it('lets in a launched season inside the registration window, and shuts it after', () => {
    const launched = { ...open, status: 'launched' as const, launchedAt: 0 };
    expect(joinRefusalOf({ ...launched, now: 7_200_000 - 1 })).toBeNull();
    expect(joinRefusalOf({ ...launched, now: 7_200_000 })).toBe('REGISTRATION_CLOSED');
  });

  it('shuts a Blitz at its launch: everybody is there, nobody arrives late (E4)', () => {
    const launched = {
      ...open,
      status: 'launched' as const,
      launchedAt: 0,
      mode: 'blitz' as const,
    };
    expect(joinRefusalOf({ ...launched, now: 1 })).toBe('BLITZ_STARTED');
  });

  it('names the Blitz ceiling apart from a full Mondiale lobby', () => {
    expect(joinRefusalOf({ ...open, seats: 4, maximum: 4, mode: 'blitz' })).toBe('BLITZ_FULL');
    expect(joinRefusalOf({ ...open, seats: 4, maximum: 4 })).toBe('LOBBY_FULL');
  });

  it('refuses a concluded season, a full lobby, and a running season with no nation left', () => {
    expect(joinRefusalOf({ ...open, status: 'concluded' })).toBe('SEASON_CONCLUDED');
    expect(joinRefusalOf({ ...open, seats: 8 })).toBe('LOBBY_FULL');
    expect(
      joinRefusalOf({ ...open, status: 'launched', launchedAt: 0, now: 1, freeNations: 0 }),
    ).toBe('NO_FREE_NATION');
  });

  it('keeps the order: a held seat first, then the end of the season, then the window', () => {
    const everything = {
      ...open,
      seated: true,
      status: 'concluded' as const,
      seats: 8,
      freeNations: 0,
    };
    expect(joinRefusalOf(everything)).toBe('SEAT_TAKEN');
    expect(joinRefusalOf({ ...everything, seated: false })).toBe('SEASON_CONCLUDED');

    const late = {
      ...open,
      status: 'launched' as const,
      launchedAt: 0,
      now: 9_000_000,
      seats: 8,
      freeNations: 0,
    };
    expect(joinRefusalOf(late)).toBe('REGISTRATION_CLOSED');
    expect(joinRefusalOf({ ...late, now: 1 })).toBe('NO_FREE_NATION');
    expect(joinRefusalOf({ ...late, now: 1, freeNations: 3 })).toBe('LOBBY_FULL');
  });

  it('does not let a lobby without nation left refuse: only a running season does', () => {
    expect(joinRefusalOf({ ...open, freeNations: 0 })).toBeNull();
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
  it('sends a lobby, or a seat that has not entered the war, to the lobby', () => {
    expect(destinationOf({ status: 'lobby', atWar: false })).toBe('salon');
    expect(destinationOf({ status: 'launched', atWar: false })).toBe('salon');
  });

  it('sends a belligerent of a running or concluded season to the board', () => {
    expect(destinationOf({ status: 'launched', atWar: true })).toBe('plateau');
    expect(destinationOf({ status: 'concluded', atWar: true })).toBe('plateau');
  });
});
