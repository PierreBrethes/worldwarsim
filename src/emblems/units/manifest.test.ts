import { describe, expect, it } from 'vitest';
import { DOMAIN_BY_ROLE, TIERS_BY_ROLE } from '@/domain/troops';
import { directRoute } from '@/domain/routing';
import type { ArcView } from '@/domain/player-view';
import type { UnitRole } from '@/domain/ids';
import { SPRITES_BY_NATION, movementSprites, spriteUrl, type NationSprites } from './manifest';

const ROLES = Object.keys(DOMAIN_BY_ROLE) as ReadonlyArray<UnitRole>;

function france(): NationSprites {
  const sprites = SPRITES_BY_NATION.france;
  if (sprites === undefined) throw new Error('France must be in the manifest');
  return sprites;
}

describe('unit sprite manifest', () => {
  it('answers for each of the nine roles for France', () => {
    const sprites = france();
    for (const role of ROLES) {
      expect(sprites, role).toHaveProperty(role);
    }
    expect(Object.keys(sprites)).toHaveLength(ROLES.length);
  });

  it('never announces two tiers where the domain only knows one', () => {
    const sprites = france();
    for (const role of ROLES) {
      const visual = sprites[role];
      if (visual === null) continue;
      if (TIERS_BY_ROLE[role] === 1) {
        expect(visual.kind, role).toBe('single');
        continue;
      }
      if (visual.kind !== 'tiered') continue;
      expect(visual.tiers, role).toHaveLength(2);
      expect(visual.tiers[0], role).not.toBe(visual.tiers[1]);
    }
  });

  /**
   * The carrier used to claim two tiers with a single plate drawn. The mismatch closed from
   * the design side, not the art side: `chiffrage-combat.md` §1 gives no nominal strength for
   * a tier-2 carrier, so the tier does not exist (ADR 0014). One tier, one plate.
   */
  it('gives the carrier a single tier and a single plate', () => {
    expect(TIERS_BY_ROLE.carrier).toBe(1);
    expect(france().carrier?.kind).toBe('single');
  });

  /**
   * The two complete plates — France is still the one without a cargo. The artillery (lot 6b)
   * has no plate in any nation yet: it is the one role every manifest leaves `null`. A `null` slipping into
   * either would go unseen on screen: `UnitSprite` falls back to its dotted frame, which is
   * exactly what a half-drawn nation is supposed to look like.
   */
  it.each(['uk', 'usa'] as const)('leaves no role undrawn for %s', (nation) => {
    const sprites = SPRITES_BY_NATION[nation];
    if (sprites === undefined) throw new Error(`${nation} must be in the manifest`);
    for (const role of ROLES) {
      if (role === 'artillery') continue;
      expect(sprites[role], role).not.toBeNull();
    }
    expect(sprites.artillery).toBeNull();
    expect(spriteUrl(nation, 'infantry', 1)).not.toBe(spriteUrl(nation, 'infantry', 2));
    expect(spriteUrl(nation, 'cargo', 1)).not.toBeNull();
  });

  /**
   * Five plates are drawn but for one role each — the soviet carrier, the german Junkers whose
   * render came out blurred, the chinese and italian carriers that never existed, the japanese
   * air transport the plate did not deliver (16/09). The `null` is the manifest's own vocabulary, not an omission:
   * naming the hole here turns it back into a failure the day the plate is drawn and left
   * unwired, and forbids a second hole from slipping in unannounced.
   */
  it.each([
    ['ussr', 'carrier'],
    ['germany', 'airTransport'],
    ['china', 'carrier'],
    ['italy', 'carrier'],
    ['japan', 'airTransport'],
  ] as const)('draws the whole %s plate but its %s', (nation, undrawn) => {
    const sprites = SPRITES_BY_NATION[nation];
    if (sprites === undefined) throw new Error(`${nation} must be in the manifest`);
    for (const role of ROLES) {
      if (role === undrawn || role === 'artillery') continue;
      expect(sprites[role], role).not.toBeNull();
    }
    expect(sprites[undrawn]).toBeNull();
    expect(spriteUrl(nation, undrawn, 1)).toBeNull();
    expect(spriteUrl(nation, 'infantry', 1)).not.toBe(spriteUrl(nation, 'infantry', 2));
  });

  /** Two nations must never share a file: one plate imported twice is the failure this
   *  catches, and on screen it reads as a nation that forgot to change uniform. */
  it('gives each drawn nation its own images', () => {
    const urls = (
      ['france', 'uk', 'usa', 'ussr', 'germany', 'china', 'italy', 'japan'] as const
    ).flatMap((nation) =>
      ROLES.filter((role) => !(nation === 'france' && role === 'cargo')) // lent by the UK
        .map((role) => spriteUrl(nation, role, 1))
        .filter((url) => url !== null),
    );
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('serves one image per tier, and nothing where the visual is missing', () => {
    expect(spriteUrl('france', 'infantry', 1)).not.toBe(spriteUrl('france', 'infantry', 2));
    expect(spriteUrl('france', 'carrier', 1)).toBe(spriteUrl('france', 'carrier', 2));
    expect(spriteUrl('france', 'cargo', 1)).toBe(spriteUrl('uk', 'cargo', 1));
    expect(spriteUrl('japan', 'airTransport', 1)).toBeNull();
    expect(spriteUrl('atlantis', 'fighter', 1)).toBeNull();
    expect(spriteUrl(null, 'fighter', 1)).toBeNull();
  });
});

describe('movementSprites', () => {
  const mine = {
    state: 'mine',
    id: 'MVT-1',
    from: [0, 0],
    to: [10, 10],
    route: directRoute([0, 0], [1, 1], 'land', 10),
    originCountry: 'France',
    destinationCountry: 'Chad',
    originLabel: 'France',
    destinationLabel: 'Tchad',
    type: 'attack',
    stack: { infantry: 2, armor: 5 },
    troopIds: [],
    schedule: { departedAt: 0, arrivesAt: 3_600_000, heldAt: null, holdUntil: null },
  } as const satisfies ArcView;

  it('shows the dominant role of my stack on the ground it walks', () => {
    expect(movementSprites(mine, 'france')?.land).toBe(spriteUrl('france', 'armor', 1));
  });

  /**
   * **The medium is dressed by what crosses it**, never by the majority of the whole pile: a
   * column is mostly boots and it still crosses the water aboard the hull that carries it.
   * Reading `representativeRole` on the whole stack here would put a rifleman on the waves.
   */
  it('dresses each medium with its own units', () => {
    const embarked = { ...mine, stack: { infantry: 8, armor: 2, cargo: 1, fighter: 1 } } as const;
    const faces = movementSprites(embarked, 'france');
    expect(faces?.land).toBe(spriteUrl('france', 'infantry', 1));
    expect(faces?.air).toBe(spriteUrl('france', 'fighter', 1));
    // Le cargo français emprunte la planche britannique, jamais un rôle d'un autre domaine.
    expect(faces?.sea).toBe(spriteUrl('uk', 'cargo', 1));
    expect(movementSprites(embarked, 'uk')?.sea).toBe(spriteUrl('uk', 'cargo', 1));
  });

  it('leaves a medium the pile carries nothing for bare', () => {
    const faces = movementSprites(mine, 'france');
    expect(faces?.sea).toBeNull();
    expect(faces?.air).toBeNull();
  });

  it('structurally shows nothing of an enemy arc', () => {
    const enemy: ArcView = {
      state: 'enemyDetected',
      detector: 'troop',
      detectorRegion: null,
      id: 'MVT-2',
      from: [0, 0],
      to: [10, 10],
      route: directRoute([0, 0], [1, 1], 'land', 10),
      headingDegrees: 45,
      headingAtMe: false,
      identification: { pierced: false },
      arrivesAt: 3_600_000,
      seenTo: 3_600_000,
      since: 0,
    };
    expect(movementSprites(enemy, 'france')).toBeNull();
  });

  /**
   * Piercing a movement opens its timeline card, not its pawn: the map stays with the
   * medium. Without this test, reading `identification.stack` would one day look legitimate.
   */
  it('stays mute on an identified enemy, known stack included', () => {
    const identified: ArcView = {
      state: 'enemyDetected',
      detector: 'troop',
      detectorRegion: null,
      id: 'MVT-3',
      from: [0, 0],
      to: [10, 10],
      route: directRoute([0, 0], [1, 1], 'land', 10),
      headingDegrees: 90,
      headingAtMe: true,
      identification: { pierced: true, type: 'attack', stack: { armor: 9 } },
      arrivesAt: 3_600_000,
      seenTo: 3_600_000,
      since: 0,
    };
    expect(movementSprites(identified, 'france')).toBeNull();
  });

  it('draws no face without a plate for the nation, nor on an empty stack', () => {
    expect(movementSprites(mine, 'atlantis')).toEqual({ land: null, sea: null, air: null });
    expect(movementSprites({ ...mine, stack: {} }, 'france')).toEqual({
      land: null,
      sea: null,
      air: null,
    });
  });
});
