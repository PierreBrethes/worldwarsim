import { describe, expect, it } from 'vitest';
import { COMBAT_RULES, DAMAGE_TABLE, nominalStrength } from '../../convex/constants';
import {
  COMBAT_PROFILES,
  drownedOf,
  profileOf,
  resolveEngagement,
  TRANSPORT_PROFILES,
  type Combatant,
  type CombatProfile,
  type Engagement,
} from './combat';
import type { UnitRole, UnitTier } from './ids';

/** The eleven profiles of the chiffrage, back to the role and tier a troop is formed at. */
const UNIT_OF: Readonly<Record<CombatProfile, { role: UnitRole; tier: UnitTier }>> = {
  infantry1: { role: 'infantry', tier: 1 },
  infantry2: { role: 'infantry', tier: 2 },
  armor1: { role: 'armor', tier: 1 },
  armor2: { role: 'armor', tier: 2 },
  landTransport: { role: 'landTransport', tier: 1 },
  fighter: { role: 'fighter', tier: 1 },
  bomber: { role: 'bomber', tier: 1 },
  airTransport: { role: 'airTransport', tier: 1 },
  escort: { role: 'escort', tier: 1 },
  cargo: { role: 'cargo', tier: 1 },
  carrier: { role: 'carrier', tier: 1 },
};

/**
 * Every case below that is not about the magazine is fought with one: the measured figures of
 * the chiffrage are the figures of a *supplied* pass, and letting a case run dry by omission
 * would move them by ×0.60 without a line saying so.
 */
const SUPPLIED = { attacker: 10_000, defender: 10_000 };

let formed = 0;
function troop(profile: CombatProfile, strength?: number): Combatant {
  const { role, tier } = UNIT_OF[profile];
  const nominal = nominalStrength(role, tier);
  formed += 1;
  return {
    id: `${profile}-${formed}`,
    role,
    tier,
    strength: strength ?? nominal,
    nominalStrength: nominal,
    formedAt: formed,
  };
}

/** The salvo of one troop, since a pass no longer has two phases to tell the sides apart. */
const firedBy = (engagement: Engagement, shooter: Combatant) =>
  engagement.strikes.filter((strike) => strike.by === shooter.id);

const duel = (attacker: CombatProfile, defender: CombatProfile) => {
  const a = troop(attacker);
  const d = troop(defender);
  const engagement = resolveEngagement({
    attackers: [a],
    defenders: [d],
    ammunition: SUPPLIED,
    rules: COMBAT_RULES,
  });
  const outcome = (id: string) => engagement.outcomes.find((one) => one.id === id)!;
  return {
    engagement,
    attacker: a,
    defender: d,
    lostByDefender: d.strength - outcome(d.id).strengthAfter,
    lostByAttacker: a.strength - outcome(a.id).strengthAfter,
    nominalAttacker: a.nominalStrength,
    nominalDefender: d.nominalStrength,
  };
};

const reaches = (from: CombatProfile, to: CombatProfile) => DAMAGE_TABLE[from][to] !== undefined;

/**
 * **The guard rail of design sheet 08 §9, run against the real resolution.** It used to live in
 * `WWS/simulation/verif-chiffrage.mjs` on a copy of the table; a copy is a thing that drifts, and
 * the day it drifted the check would have been passing on numbers the game no longer plays. It
 * replays the same seventy-five couples through `resolveEngagement` itself.
 */
describe('the damage table holds no absolute counter', () => {
  const couples = COMBAT_PROFILES.flatMap((attacker) =>
    COMBAT_PROFILES.filter((defender) => reaches(attacker, defender)).map(
      (defender) => [attacker, defender] as const,
    ),
  );

  it('reaches seventy-five couples out of a hundred and twenty-one', () => {
    expect(couples).toHaveLength(75);
    expect(COMBAT_PROFILES.length ** 2).toBe(121);
  });

  it.each(couples)('%s against %s is neither a wipe nor a free hit', (attacker, defender) => {
    const fight = duel(attacker, defender);
    const shareLost = fight.lostByDefender / fight.nominalDefender;
    const shareTaken = fight.lostByAttacker / fight.nominalAttacker;

    if (!TRANSPORT_PROFILES.includes(defender)) {
      expect(
        shareLost >= 0.95 && shareTaken <= 0.05,
        `${attacker} → ${defender} wipes for nothing`,
      ).toBe(false);
    }
    if (reaches(defender, attacker) && DAMAGE_TABLE[defender][attacker]! >= 0.15) {
      expect(
        fight.lostByAttacker,
        `${defender} can reach ${attacker} and still costs it nothing`,
      ).toBeGreaterThan(0);
    }
  });
});

/**
 * **La révision du 16/09 de l'ADR 0014** : les deux camps tirent sur l'état d'avant la passe. Le
 * cas de référence en donne les deux chiffres, et ils sont dans l'ADR — c'est le seul endroit où
 * le joueur peut lire ce que coûte une attaque frontale.
 */
describe('the reference case of ADR 0014', () => {
  it('has fifty soldiers lose twenty-five and cost the attacker twenty-nine', () => {
    const fight = duel('infantry1', 'infantry1');
    expect(fight.lostByDefender).toBe(25);
    expect(fight.lostByAttacker).toBe(29);
  });

  it('makes the attacker of an even fight the one that pays', () => {
    const fight = duel('infantry1', 'infantry1');
    expect(fight.lostByAttacker).toBeGreaterThan(fight.lostByDefender);
  });

  it('gives mark-2 infantry the answer to a heavy tank that mark 1 does not have', () => {
    // Six heavy tanks: mark 1 does not scratch one of them, mark 2 takes out three.
    expect(duel('infantry1', 'armor2').lostByDefender).toBe(0);
    expect(duel('infantry2', 'armor2').lostByDefender).toBe(3);
  });
});

describe('one pass, two salvoes, and the excess is lost', () => {
  it('wastes the strikes of six columns aimed at a single defender', () => {
    const attackers = Array.from({ length: 6 }, () => troop('armor2'));
    const lone = troop('infantry1');
    const engagement = resolveEngagement({
      attackers,
      defenders: [lone],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    // Six tank columns strike; the first two already take the fifty soldiers to nothing, and the
    // four behind them find nothing left to aim at. Nothing spills over.
    const salvo = engagement.strikes.filter((strike) =>
      attackers.some((one) => one.id === strike.by),
    );
    expect(salvo).toHaveLength(2);
    expect(salvo.reduce((sum, strike) => sum + strike.losses, 0)).toBe(50);
    expect(engagement.outcomes.find((one) => one.id === lone.id)!.state).toBe('destroyed');
    expect(engagement.winner).toBe('attacker');
  });

  it('concentrates on the transport when the table says the transport is the best share', () => {
    const rifles = troop('infantry1');
    const armour = troop('armor1');
    const lorries = troop('landTransport');
    const engagement = resolveEngagement({
      attackers: [rifles],
      defenders: [armour, lorries],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    // .70 against the lorries, .15 against the tanks: nobody screens for anybody.
    expect(firedBy(engagement, rifles)[0]!.target).toBe(lorries.id);
    expect(engagement.outcomes.find((one) => one.id === armour.id)!.strengthAfter).toBe(12);
  });

  it('lets a defender broken by the salvo fire in the same pass before it routs', () => {
    const lorries = troop('landTransport');
    const worn = troop('infantry1', 16);
    const engagement = resolveEngagement({
      attackers: [lorries],
      defenders: [worn],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    const outcome = engagement.outcomes.find((one) => one.id === worn.id)!;
    expect(outcome.state).toBe('routed');
    expect(outcome.strengthAfter).toBeGreaterThan(0);
    // Simultaneous: it broke contact *after* having fired, not instead of firing.
    expect(firedBy(engagement, worn)).toHaveLength(1);
    expect(firedBy(engagement, worn)[0]!.target).toBe(lorries.id);
    expect(engagement.winner).toBe('attacker');
  });

  it('lets a defender destroyed by the salvo fire all the same', () => {
    const tanks = troop('armor2');
    const rifles = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [tanks, troop('armor2')],
      defenders: [rifles],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    expect(engagement.outcomes.find((one) => one.id === rifles.id)!.state).toBe('destroyed');
    expect(firedBy(engagement, rifles)).toHaveLength(1);
    expect(firedBy(engagement, rifles)[0]!.target).toBe(tanks.id);
  });

  it('has the defender pick with the table, like anyone else', () => {
    const lorries = troop('landTransport');
    const bombers = troop('bomber');
    const holder = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [lorries, bombers],
      defenders: [holder],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    // A rifle company cannot reach a bomber at all; it fires at the only thing it reaches, and
    // no longer at "the one that struck it last".
    expect(firedBy(engagement, holder)).toHaveLength(1);
    expect(firedBy(engagement, holder)[0]!.target).toBe(lorries.id);
  });

  it('fires from neither side when neither reaches the other', () => {
    const fight = duel('armor2', 'airTransport');
    expect(fight.engagement.strikes).toHaveLength(0);
    expect(fight.lostByDefender).toBe(0);
    expect(fight.lostByAttacker).toBe(0);
  });

  it('fires from the one side that reaches, and it may be the defender', () => {
    const fight = duel('armor2', 'bomber');
    expect(fight.engagement.strikes).toHaveLength(1);
    expect(fight.engagement.strikes[0]!.by).toBe(fight.defender.id);
    expect(fight.lostByAttacker).toBeGreaterThan(0);
    expect(fight.lostByDefender).toBe(0);
  });

  it('writes one phase and one only, the riposte being legacy', () => {
    const fight = duel('infantry1', 'infantry1');
    expect(fight.engagement.strikes.map((strike) => strike.phase)).toEqual(['strike', 'strike']);
  });
});

/**
 * Question 18, settled 25/08. The bill moved from the recruitment to the pass, so this is where
 * the whole of the ammunition rule now lives — there is no other place a round is spent.
 */
describe('the magazine is billed at the pass', () => {
  it('draws one round per five points of engaged strength, on both sides', () => {
    const engagement = resolveEngagement({
      attackers: [troop('infantry1'), troop('armor1')],
      defenders: [troop('infantry1', 22)],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    // 50 soldiers and 12 tanks: ten rounds and three. The defender's 22 points round up to five.
    expect(engagement.magazine.attacker).toEqual({ needed: 13, spent: 13, dry: false });
    expect(engagement.magazine.defender).toEqual({ needed: 5, spent: 5, dry: false });
  });

  it('bills a company that does not outlive its salvo, because it was engaged all the same', () => {
    const engagement = resolveEngagement({
      attackers: [troop('armor2'), troop('armor2')],
      defenders: [troop('infantry1')],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    expect(engagement.outcomes.find((one) => one.side === 'defender')!.state).toBe('destroyed');
    expect(engagement.magazine.defender.spent).toBe(10);
  });

  it('takes everything that is left and fires at .60 when the stock cannot cover the pass', () => {
    const attacker = troop('infantry1');
    const dry = resolveEngagement({
      attackers: [attacker],
      defenders: [troop('infantry1')],
      ammunition: { attacker: 4, defender: 10_000 },
      rules: COMBAT_RULES,
    });
    const supplied = duel('infantry1', 'infantry1');

    expect(dry.magazine.attacker).toEqual({ needed: 10, spent: 4, dry: true });
    // Bad, never absent: it still strikes, at .60 of the twenty-two of the reference case.
    const lost = firedBy(dry, attacker)[0]!.losses;
    expect(lost).toBe(Math.round(supplied.lostByDefender * 0.6));
    expect(lost).toBeGreaterThan(0);
  });

  it('leaves the other side alone when only one magazine is empty', () => {
    const defender = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [troop('infantry1')],
      defenders: [defender],
      ammunition: { attacker: 0, defender: 10_000 },
      rules: COMBAT_RULES,
    });
    const supplied = duel('infantry1', 'infantry1');

    expect(engagement.magazine.attacker).toEqual({ needed: 10, spent: 0, dry: true });
    expect(engagement.magazine.defender.dry).toBe(false);
    // Simultaneous: the defender's salvo owes nothing to what the attacker managed to fire.
    expect(firedBy(engagement, defender)[0]!.losses).toBe(supplied.lostByAttacker);
  });

  it('asks nothing of a side that brings nothing', () => {
    const engagement = resolveEngagement({
      attackers: [troop('infantry1')],
      defenders: [],
      ammunition: { attacker: 10_000, defender: 0 },
      rules: COMBAT_RULES,
    });

    expect(engagement.magazine.defender).toEqual({ needed: 0, spent: 0, dry: false });
  });
});

describe('the profile of a troop', () => {
  it('splits the two marks only where they are different weapons', () => {
    expect(profileOf('infantry', 2)).toBe('infantry2');
    expect(profileOf('armor', 1)).toBe('armor1');
    expect(profileOf('carrier', 1)).toBe('carrier');
  });
});

/**
 * **Ce que le large prend quand la coque tombe** (règle 4 du 18/09). Une pile embarquée peut
 * rester en mer, donc la passe de résolution y a désormais une conséquence que la terre n'a
 * pas : une troupe terrestre qu'aucune coque ne porte plus est **détruite**, jamais déroutée —
 * il n'y a rien où se replier. C'est le prix de rester au large, et la raison d'une escorte.
 *
 * Le siège est celui de `stackRows`, la fonction même que le panneau de garnison dessine : la
 * place qu'on voit au départ est la place qui sauve à l'arrivée.
 */
describe('les passagers d’une coque coulée', () => {
  const unit = (id: string, role: UnitRole) => ({ id, role });

  it('drowns the infantry whose only hull went down', () => {
    const fate = drownedOf([unit('i1', 'infantry')], []);
    expect(fate.drowned).toEqual(['i1']);
    expect(fate.withdrawn).toEqual([]);
  });

  it('keeps aboard what a standing hull still carries', () => {
    const fate = drownedOf(
      [unit('c1', 'cargo'), unit('i1', 'infantry'), unit('i2', 'infantry')],
      [],
    );
    expect(fate.drowned).toEqual([]);
    expect(fate.withdrawn).toEqual([]);
  });

  /** Six places pour une seule coque : le septième passager n'a plus de banc. */
  it('drowns only what the remaining berths cannot hold', () => {
    const riders = Array.from({ length: 7 }, (_, index) => unit(`i${index}`, 'infantry'));
    const fate = drownedOf([unit('c1', 'cargo'), ...riders], []);
    expect(fate.drowned).toEqual(['i6']);
  });

  /** Deux coques, une coulée : la passe n'en laisse qu'une, et elle ne porte que six. */
  it('counts the berths of the hulls still afloat, never of those that sank', () => {
    const riders = Array.from({ length: 8 }, (_, index) => unit(`i${index}`, 'infantry'));
    const fate = drownedOf([unit('c1', 'cargo'), ...riders], []);
    expect(fate.drowned).toEqual(['i6', 'i7']);
  });

  /** Une coque déroutée emporte ses passagers dans son repli, à sa capacité ; l'excédent coule. */
  it('takes with a routed hull what it can carry, and drowns the rest', () => {
    const riders = Array.from({ length: 8 }, (_, index) => unit(`i${index}`, 'infantry'));
    const fate = drownedOf(riders, [unit('c1', 'cargo')]);
    expect(fate.withdrawn).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5']);
    expect(fate.drowned).toEqual(['i6', 'i7']);
  });

  /** Les bancs debout d'abord : un passager sauvé sur place ne part pas avec le replié. */
  it('fills the standing hull before the routed one', () => {
    const riders = Array.from({ length: 7 }, (_, index) => unit(`i${index}`, 'infantry'));
    const fate = drownedOf([unit('c1', 'cargo'), ...riders], [unit('c2', 'cargo')]);
    expect(fate.withdrawn).toEqual(['i6']);
    expect(fate.drowned).toEqual([]);
  });

  /** Un char coûte deux places : la capacité se compte en places, jamais en têtes — six bancs
   *  portent trois chars, et le quatrième coule. */
  it('bills a tank for two berths, as every crossing does', () => {
    const tanks = Array.from({ length: 4 }, (_, index) => unit(`a${index}`, 'armor'));
    const fate = drownedOf([unit('c1', 'cargo'), ...tanks], []);
    expect(fate.drowned).toEqual(['a3']);
  });

  /** Rien de terrestre, rien à noyer : une flotte pure repart comme elle est venue. */
  it('leaves a pure fleet alone', () => {
    expect(drownedOf([unit('e1', 'escort'), unit('c1', 'cargo')], [])).toEqual({
      drowned: [],
      withdrawn: [],
    });
  });
});
