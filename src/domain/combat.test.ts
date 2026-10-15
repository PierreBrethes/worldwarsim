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
  type PassMode,
} from './combat';
import type { UnitRole, UnitTier } from './ids';

/** The eleven profiles of the chiffrage, back to the role and tier a troop is formed at. */
const UNIT_OF: Readonly<Record<CombatProfile, { role: UnitRole; tier: UnitTier }>> = {
  infantry1: { role: 'infantry', tier: 1 },
  infantry2: { role: 'infantry', tier: 2 },
  armor1: { role: 'armor', tier: 1 },
  armor2: { role: 'armor', tier: 2 },
  landTransport: { role: 'landTransport', tier: 1 },
  artillery: { role: 'artillery', tier: 1 },
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
function troop(profile: CombatProfile, strength?: number, sheltered = false): Combatant {
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
    sheltered,
  };
}

/** What one troop fired in the pass: its strike, or its riposte. */
const firedBy = (engagement: Engagement, shooter: Combatant) =>
  engagement.strikes.filter((strike) => strike.by === shooter.id);

const duel = (
  attacker: CombatProfile,
  defender: CombatProfile,
  { sheltered = false, mode = 'initiative' }: { sheltered?: boolean; mode?: PassMode } = {},
) => {
  const a = troop(attacker);
  const d = troop(defender, undefined, sheltered);
  const engagement = resolveEngagement({
    attackers: [a],
    defenders: [d],
    ammunition: SUPPLIED,
    rules: COMBAT_RULES,
    mode,
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

  it('reaches ninety-three couples out of a hundred and forty-four', () => {
    expect(couples).toHaveLength(93);
    expect(COMBAT_PROFILES.length ** 2).toBe(144);
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
    /** L'artillerie ne riposte jamais au contact (B20) : sa case dit ce que vaut son tir
     *  indirect, et c'est l'infanterie au contact qui la tue. */
    if (
      defender !== 'artillery' &&
      reaches(defender, attacker) &&
      DAMAGE_TABLE[defender][attacker]! >= 0.15
    ) {
      expect(
        fight.lostByAttacker,
        `${defender} can reach ${attacker} and still costs it nothing`,
      ).toBeGreaterThan(0);
    }
  });
});

/**
 * **L'initiative** (grilling du 14/10, B16) : l'attaquant frappe, le défenseur riposte avec ce
 * qui lui reste. Les deux chiffres du cas de référence sont dans `CLAUDE.md` — c'est là qu'on lit
 * ce que coûte une attaque frontale, en terrain libre et contre une garnison.
 */
describe('the reference case of the initiative', () => {
  it('has fifty soldiers in the open lose twenty-five and cost the attacker thirteen', () => {
    const fight = duel('infantry1', 'infantry1');
    expect(fight.lostByDefender).toBe(25);
    expect(fight.lostByAttacker).toBe(13);
  });

  /** C1, décision de Pierre du 14/10 : la garnison encaisse ×0,7 et riposte sans multiplicateur.
   *  .5 × 50 × .7 = 17,5, arrondi à 18 ; les 32 restants ripostent pour 16. */
  it('has the same fifty in garrison take eighteen and cost the attacker sixteen', () => {
    const fight = duel('infantry1', 'infantry1', { sheltered: true });
    expect(fight.lostByDefender).toBe(18);
    expect(fight.lostByAttacker).toBe(16);
  });

  it('makes the attacker of an even fight the one that comes out ahead', () => {
    const fight = duel('infantry1', 'infantry1', { sheltered: true });
    expect(fight.lostByAttacker).toBeLessThan(fight.lostByDefender);
  });

  /** Décision de Pierre du 14/10 (C2) : le char léger répond au lourd à .25, et **une riposte
   *  qui touche fait au moins une perte** — laissé à 3 / 12, il riposte pour .375, qui
   *  s'arrondissait à rien. */
  it('has the light tank the heavy one leaves standing answer for at least one', () => {
    const fight = duel('armor2', 'armor1');
    expect(fight.lostByDefender).toBe(9);
    expect(fight.lostByAttacker).toBe(1);
    expect(fight.engagement.strikes.at(-1)).toMatchObject({ phase: 'riposte', losses: 1 });
  });

  it('gives mark-2 infantry the answer to a heavy tank that mark 1 does not have', () => {
    // Six heavy tanks: mark 1 does not scratch one of them, mark 2 takes out three.
    expect(duel('infantry1', 'armor2').lostByDefender).toBe(0);
    expect(duel('infantry2', 'armor2').lostByDefender).toBe(3);
  });
});

describe('the strike, then the riposte, and the excess is lost', () => {
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

  it('lets a defender broken by the strike riposte with what it has left, then rout', () => {
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
    // The routing is read after the riposte: it answers first, with its remainder, then breaks.
    const [riposte] = firedBy(engagement, worn);
    expect(riposte).toMatchObject({ phase: 'riposte', target: lorries.id });
    expect(riposte!.losses).toBe(
      Math.round(
        DAMAGE_TABLE.infantry1.landTransport! *
          (outcome.strengthAfter / 50) *
          lorries.nominalStrength,
      ),
    );
    expect(engagement.winner).toBe('attacker');
  });

  it('gives no riposte to a defender the strike destroyed', () => {
    const tanks = troop('armor2');
    const rifles = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [tanks, troop('armor2')],
      defenders: [rifles],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    expect(engagement.outcomes.find((one) => one.id === rifles.id)!.state).toBe('destroyed');
    expect(firedBy(engagement, rifles)).toHaveLength(0);
    expect(engagement.outcomes.find((one) => one.id === tanks.id)!.strengthAfter).toBe(
      tanks.strength,
    );
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
    expect(fight.engagement.strikes[0]).toMatchObject({ by: fight.defender.id, phase: 'riposte' });
    expect(fight.lostByAttacker).toBeGreaterThan(0);
    expect(fight.lostByDefender).toBe(0);
  });

  it('gives no riposte to a defender the table does not let reach the attacker', () => {
    const bombers = troop('bomber');
    const rifles = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [bombers],
      defenders: [rifles],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });
    expect(firedBy(engagement, rifles)).toHaveLength(0);
    expect(firedBy(engagement, bombers)).toHaveLength(1);
  });

  it('writes the strike first and the riposte after it', () => {
    const fight = duel('infantry1', 'infantry1');
    expect(fight.engagement.strikes.map((strike) => [strike.phase, strike.by])).toEqual([
      ['strike', fight.attacker.id],
      ['riposte', fight.defender.id],
    ]);
  });

  it('protects a garrison and never a pile posted in the open', () => {
    expect(duel('infantry1', 'infantry1').lostByDefender).toBe(25);
    expect(duel('infantry1', 'infantry1', { sheltered: true }).lostByDefender).toBe(18);
  });
});

/**
 * **Le choc** (B17) : deux unités qui s'attaquent l'une l'autre tirent ensemble, sur l'état
 * d'avant la passe. Le serveur ne l'emploie pas encore — il attend la Blitz.
 */
describe('indirect fire', () => {
  it('lets the battery strike from afar and the target never answer', () => {
    const fight = duel('artillery', 'infantry1', { mode: 'indirect' });
    expect(fight.lostByDefender).toBe(30);
    expect(fight.lostByAttacker).toBe(0);
    expect(fight.engagement.strikes).toHaveLength(1);
  });

  it('leaves the artillery silent at contact, whichever side it is on', () => {
    const attacked = duel('infantry1', 'artillery');
    expect(attacked.lostByDefender).toBe(8);
    expect(attacked.lostByAttacker).toBe(0);
    const charging = duel('artillery', 'infantry1');
    expect(firedBy(charging.engagement, charging.attacker)).toHaveLength(0);
  });

  it('bills the target nothing, since it does not fire', () => {
    const fight = duel('artillery', 'infantry1', { mode: 'indirect' });
    expect(fight.engagement.magazine.defender.needed).toBe(0);
  });
});

describe('the shock', () => {
  it('has both sides fire on the state the pass opened with', () => {
    const fight = duel('infantry1', 'infantry1', { mode: 'shock' });
    expect(fight.lostByDefender).toBe(25);
    expect(fight.lostByAttacker).toBe(25);
    expect(fight.engagement.strikes.map((strike) => strike.phase)).toEqual(['strike', 'strike']);
  });

  it('lets a defender destroyed in the shock fire all the same', () => {
    const tanks = troop('armor2');
    const rifles = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [tanks, troop('armor2')],
      defenders: [rifles],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
      mode: 'shock',
    });
    expect(engagement.outcomes.find((one) => one.id === rifles.id)!.state).toBe('destroyed');
    expect(firedBy(engagement, rifles)).toHaveLength(1);
  });

  it('still protects a garrison, and its salvo carries nothing more', () => {
    const fight = duel('infantry1', 'infantry1', { mode: 'shock', sheltered: true });
    expect(fight.lostByDefender).toBe(18);
    expect(fight.lostByAttacker).toBe(25);
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
      mode: 'shock',
    });

    // 50 soldiers and 12 tanks: ten rounds and three. The defender's 22 points round up to five.
    expect(engagement.magazine.attacker).toEqual({ needed: 13, spent: 13, dry: false });
    expect(engagement.magazine.defender).toEqual({ needed: 5, spent: 5, dry: false });
  });

  /** Décision de Pierre du 14/10 (C3) : on ne paie que ce qu'on tire. */
  it('bills the riposte on what the strike left standing', () => {
    const engagement = resolveEngagement({
      attackers: [troop('infantry1')],
      defenders: [troop('infantry1')],
      ammunition: SUPPLIED,
      rules: COMBAT_RULES,
    });

    // Twenty-five soldiers left to answer: five rounds, not the ten the company brought in.
    expect(engagement.magazine.defender).toEqual({ needed: 5, spent: 5, dry: false });
  });

  it('bills nothing to a defence the strike wiped out, and never calls it dry', () => {
    const engagement = resolveEngagement({
      attackers: [troop('armor2'), troop('armor2')],
      defenders: [troop('infantry1')],
      ammunition: { attacker: 10_000, defender: 0 },
      rules: COMBAT_RULES,
    });

    expect(engagement.outcomes.find((one) => one.side === 'defender')!.state).toBe('destroyed');
    expect(engagement.magazine.defender).toEqual({ needed: 0, spent: 0, dry: false });
  });

  it('judges the riposte dry on what it needs after the strike', () => {
    const defender = troop('infantry1');
    const engagement = resolveEngagement({
      attackers: [troop('infantry1')],
      defenders: [defender],
      ammunition: { attacker: 10_000, defender: 5 },
      rules: COMBAT_RULES,
    });

    expect(engagement.magazine.defender).toEqual({ needed: 5, spent: 5, dry: false });
    expect(firedBy(engagement, defender)[0]!.losses).toBe(13);
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
    // Dry, the strike is weaker, so more is left to riposte with than in the supplied case.
    expect(firedBy(engagement, defender)[0]!.losses).toBeGreaterThan(supplied.lostByAttacker);
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
 * **On est à bord d'un transport, pas d'une place** (révision de l'ADR 0025, 15/10) : la noyade
 * lit qui porte qui, et personne ne change de coque au milieu d'une passe.
 */
describe('les passagers d’une coque coulée', () => {
  const unit = (id: string, role: UnitRole, carriedBy?: string) => ({ id, role, carriedBy });

  it('drowns the infantry whose hull went down, even with another hull afloat', () => {
    const fate = drownedOf([unit('c2', 'cargo'), unit('i1', 'infantry', 'c1')], []);
    expect(fate).toEqual({ drowned: ['i1'], withdrawn: [] });
  });

  it('keeps aboard what a standing hull carries', () => {
    const fate = drownedOf(
      [unit('c1', 'cargo'), unit('i1', 'infantry', 'c1'), unit('i2', 'infantry', 'c1')],
      [],
    );
    expect(fate).toEqual({ drowned: [], withdrawn: [] });
  });

  it('takes with a routed hull what it carries', () => {
    const fate = drownedOf([unit('i1', 'infantry', 'c1')], [unit('c1', 'cargo')]);
    expect(fate).toEqual({ drowned: [], withdrawn: ['i1'] });
  });

  it('sinks a truck and its riflemen with their cargo, and saves them with it', () => {
    const truck = [unit('t1', 'landTransport', 'c1'), unit('i1', 'infantry', 't1')];
    expect(drownedOf(truck, []).drowned).toEqual(['t1', 'i1']);
    expect(drownedOf([unit('c1', 'cargo'), ...truck], []).drowned).toEqual([]);
  });

  it('drowns a land troop at sea that boarded nothing', () => {
    expect(drownedOf([unit('c1', 'cargo'), unit('a1', 'armor')], []).drowned).toEqual(['a1']);
  });

  /** Rien de terrestre, rien à noyer : une flotte pure repart comme elle est venue. */
  it('leaves a pure fleet alone', () => {
    expect(drownedOf([unit('e1', 'escort'), unit('c1', 'cargo')], [])).toEqual({
      drowned: [],
      withdrawn: [],
    });
  });
});
