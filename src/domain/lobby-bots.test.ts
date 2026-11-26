import { describe, expect, it } from 'vitest';
import { botAdditionRefusalOf, botNicknameOf, botRemovalRefusalOf } from './lobby-bots';

const open = {
  founder: true,
  status: 'lobby',
  seats: 2,
  maximum: 8,
  mode: 'mondiale',
} as const;

describe('botAdditionRefusalOf', () => {
  it("laisse le fondateur d'une Mondiale au salon ajouter un bot tant qu'une place reste", () => {
    expect(botAdditionRefusalOf(open)).toBeNull();
    expect(botAdditionRefusalOf({ ...open, seats: 7 })).toBeNull();
  });

  it("refuse la Blitz, qui n'a pas de bot", () => {
    expect(botAdditionRefusalOf({ ...open, mode: 'blitz' })).toBe('BOTS_MONDIALE_ONLY');
  });

  it("refuse qui n'est pas le fondateur", () => {
    expect(botAdditionRefusalOf({ ...open, founder: false })).toBe('BOTS_FOUNDER_ONLY');
  });

  it("refuse une saison qui n'est plus au salon", () => {
    expect(botAdditionRefusalOf({ ...open, status: 'launched' })).toBe('SEASON_ALREADY_LAUNCHED');
    expect(botAdditionRefusalOf({ ...open, status: 'concluded' })).toBe('SEASON_CONCLUDED');
  });

  it('refuse un salon plein', () => {
    expect(botAdditionRefusalOf({ ...open, seats: 8 })).toBe('LOBBY_FULL');
  });
});

describe('botRemovalRefusalOf', () => {
  const removable = {
    founder: true,
    status: 'lobby',
    bot: true,
    departureAt: null,
    seats: 4,
    minimum: 4,
  } as const;

  it('laisse le fondateur retirer un bot avant le lancement', () => {
    expect(botRemovalRefusalOf(removable)).toBeNull();
  });

  it('refuse un joueur, qui ne se retire pas de la table par la main du fondateur', () => {
    expect(botRemovalRefusalOf({ ...removable, bot: false })).toBe('NOT_A_BOT');
  });

  it("refuse qui n'est pas le fondateur, et une saison lancée", () => {
    expect(botRemovalRefusalOf({ ...removable, founder: false })).toBe('BOTS_FOUNDER_ONLY');
    expect(botRemovalRefusalOf({ ...removable, status: 'launched' })).toBe(
      'SEASON_ALREADY_LAUNCHED',
    );
  });
});

describe('botRemovalRefusalOf, une annonce au départ fixé (#654)', () => {
  const listed = {
    founder: true,
    status: 'lobby',
    bot: true,
    departureAt: 1_800_000_000_000,
    minimum: 4,
  } as const;

  it('refuse le retrait qui ferait passer la table sous le minimum : un départ fixé ne se défait pas', () => {
    expect(botRemovalRefusalOf({ ...listed, seats: 4 })).toBe('DEPARTURE_FIXED_MINIMUM');
  });

  it('laisse retirer un bot qui ne descend pas la table sous le minimum, ou sans départ fixé', () => {
    expect(botRemovalRefusalOf({ ...listed, seats: 5 })).toBeNull();
    expect(botRemovalRefusalOf({ ...listed, seats: 4, departureAt: null })).toBeNull();
  });
});

describe('botNicknameOf', () => {
  it('prend le premier BotN que personne ne tient', () => {
    expect(botNicknameOf(() => false)).toBe('Bot1');
    expect(botNicknameOf((nickname) => ['Bot1', 'Bot2', 'Bot4'].includes(nickname))).toBe('Bot3');
  });
});
