import { describe, expect, it } from 'vitest';
import { COMBAT_RULES, DAMAGE_TABLE, nominalStrength } from '../../convex/constants';
import {
  COMBAT_PROFILES,
  profileOf,
  resolveEngagement,
  type Combatant,
  type CombatProfile,
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

  /** The three transports are victims by design — they carry, they do not fight. */
  const VICTIMS: ReadonlyArray<CombatProfile> = ['landTransport', 'airTransport', 'cargo'];

  it.each(couples)('%s against %s is neither a wipe nor a free hit', (attacker, defender) => {
    const fight = duel(attacker, defender);
    const shareLost = fight.lostByDefender / fight.nominalDefender;
    const shareTaken = fight.lostByAttacker / fight.nominalAttacker;

    if (!VICTIMS.includes(defender)) {
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

describe('the reference case of ADR 0014', () => {
  it('has fifty soldiers lose twenty-two and cost the attacker sixteen', () => {
    const fight = duel('infantry1', 'infantry1');
    expect(fight.lostByDefender).toBe(22);
    expect(fight.lostByAttacker).toBe(16);
  });

  it('leaves the initiative worth barely more than the defender bonus', () => {
    const fight = duel('infantry1', 'infantry1');
    expect(fight.lostByDefender / fight.lostByAttacker).toBeLessThan(1.5);
  });

  it('gives mark-2 infantry the answer to a heavy tank that mark 1 does not have', () => {
    // Six heavy tanks: mark 1 does not scratch one of them, mark 2 takes out two.
    expect(duel('infantry1', 'armor2').lostByDefender).toBe(0);
    expect(duel('infantry2', 'armor2').lostByDefender).toBe(2);
  });
});

describe('one pass, and the excess is lost', () => {
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
    // four behind them hit a target that is no longer standing. Nothing spills over.
    expect(engagement.strikes.filter((strike) => strike.phase === 'strike')).toHaveLength(2);
    expect(engagement.strikes.reduce((sum, strike) => sum + strike.losses, 0)).toBe(50);
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
    const first = engagement.strikes[0]!;
    expect(first.target).toBe(lorries.id);
    expect(engagement.outcomes.find((one) => one.id === armour.id)!.strengthAfter).toBe(12);
  });

  it('routs a weakened troop out of the engagement instead of killing it', () => {
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
    // It broke contact: it never fired back.
    expect(engagement.strikes.filter((strike) => strike.phase === 'riposte')).toHaveLength(0);
    expect(engagement.winner).toBe('attacker');
  });

  it('answers the one that struck it, or the best it can reach when it cannot', () => {
    const lorries = troop('landTransport');
    const bombers = troop('bomber');
    const holder = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [lorries, bombers],
      defenders: [holder],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    // The bombers strike last, so they are what struck it — and a rifle company does not answer
    // a bomber. It fires back at the lorries it can reach instead.
    const riposte = engagement.strikes.find((strike) => strike.phase === 'riposte')!;
    expect(riposte.target).toBe(lorries.id);
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

  it('bills a company that never lives to riposte, because it was engaged all the same', () => {
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
    const dry = resolveEngagement({
      attackers: [troop('infantry1')],
      defenders: [troop('infantry1')],
      ammunition: { attacker: 4, defender: 10_000 },
      rules: COMBAT_RULES,
    });
    const supplied = duel('infantry1', 'infantry1');

    expect(dry.magazine.attacker).toEqual({ needed: 10, spent: 4, dry: true });
    // Bad, never absent: it still strikes, at .60 of the twenty-two of the reference case.
    const lost = dry.strikes.find((strike) => strike.phase === 'strike')!.losses;
    expect(lost).toBe(Math.round(supplied.lostByDefender * 0.6));
    expect(lost).toBeGreaterThan(0);
  });

  it('leaves the other side alone when only one magazine is empty', () => {
    const engagement = resolveEngagement({
      attackers: [troop('infantry1')],
      defenders: [troop('infantry1')],
      ammunition: { attacker: 0, defender: 10_000 },
      rules: COMBAT_RULES,
    });
    const supplied = duel('infantry1', 'infantry1');

    expect(engagement.magazine.attacker).toEqual({ needed: 10, spent: 0, dry: true });
    expect(engagement.magazine.defender.dry).toBe(false);
    // The riposte answers a strike weakened by .60, so it has more to answer with.
    expect(engagement.strikes.find((strike) => strike.phase === 'riposte')!.losses).toBeGreaterThan(
      supplied.lostByAttacker,
    );
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
