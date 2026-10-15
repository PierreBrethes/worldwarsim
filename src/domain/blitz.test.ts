import { describe, expect, it } from 'vitest';
import {
  blitzRecruitRefusalOf,
  clockVerdict,
  contactAt,
  fundsAt,
  incomePerMinute,
  mendPlan,
  mendStep,
  passModeOf,
  pursuitVerdict,
  rolesFormedBy,
  theatreMinutesPer1000Km,
  withinTheatre,
} from './blitz';
import { theatreById } from './theatres';

describe('les fonds de la Blitz', () => {
  it('versent par minute pour les villes et le QG, rien pour une caserne', () => {
    expect(incomePerMinute(['hq', 'city', 'city', 'barracks', 'port', 'airfield'])).toBe(60);
  });

  it('courent depuis le dernier règlement, sans écriture', () => {
    expect(fundsAt({ stock: 100, at: 0, perMinute: 30 }, 90_000)).toBe(145);
    expect(fundsAt({ stock: 100, at: 60_000, perMinute: 30 }, 0)).toBe(100);
  });
});

describe('le recrutement de la Blitz', () => {
  const ok = { role: 'infantry', funds: 1_000, troops: 0, occupied: false } as const;

  it('forme dans le bâtiment de son domaine, et l’infanterie au QG', () => {
    expect(rolesFormedBy('hq')).toEqual(['infantry']);
    expect(rolesFormedBy('port')).toEqual(['escort', 'cargo', 'carrier']);
    expect(rolesFormedBy('city')).toEqual([]);
    expect(blitzRecruitRefusalOf({ ...ok, site: 'hq' })).toBeNull();
    expect(blitzRecruitRefusalOf({ ...ok, site: 'hq', role: 'armor' })).toBe(
      'WRONG_PROJECTION_BUILDING',
    );
    expect(blitzRecruitRefusalOf({ ...ok, site: 'airfield', role: 'bomber' })).toBeNull();
    expect(blitzRecruitRefusalOf({ ...ok, site: 'barracks', role: 'artillery' })).toBeNull();
    expect(blitzRecruitRefusalOf({ ...ok, site: 'hq', role: 'artillery' })).toBe(
      'WRONG_PROJECTION_BUILDING',
    );
  });

  it('ne forme que dans un bâtiment libre (U6)', () => {
    expect(blitzRecruitRefusalOf({ ...ok, site: 'barracks', occupied: true })).toBe(
      'SITE_OCCUPIED',
    );
    expect(blitzRecruitRefusalOf({ ...ok, site: 'city', occupied: true })).toBe(
      'WRONG_PROJECTION_BUILDING',
    );
  });

  it('se paie en fonds, et une borne invisible arrête l’armée', () => {
    expect(blitzRecruitRefusalOf({ ...ok, site: 'barracks', funds: 59 })).toBe(
      'INSUFFICIENT_FUNDS',
    );
    expect(blitzRecruitRefusalOf({ ...ok, site: 'barracks', troops: 80 })).toBe(
      'TROOP_BOUND_REACHED',
    );
  });
});

describe('le soin de la Blitz', () => {
  const infantry = { role: 'infantry', strength: 20, nominalStrength: 50 } as const;

  it('rend un huitième de la force par pas, au prix du rôle', () => {
    expect(mendStep(infantry, 100)).toEqual({ strength: 27, cost: 5 });
  });

  it('ne dépasse pas le nominal, et ne soigne pas qui ne peut payer', () => {
    expect(mendStep({ ...infantry, strength: 48 }, 100)).toEqual({ strength: 50, cost: 2 });
    expect(mendStep({ ...infantry, strength: 50 }, 100)).toBeNull();
    expect(mendStep(infantry, 2)).toBeNull();
  });

  it('paie les troupes une à une, et laisse celle que les fonds ne couvrent plus', () => {
    const plan = mendPlan(
      [
        { ...infantry, id: 'a' },
        { ...infantry, id: 'b' },
      ],
      6,
    );
    expect(plan.map((step) => [step.troop.id, step.cost])).toEqual([['a', 5]]);
  });
});

const europe = theatreById('europe')!;
const pacific = theatreById('pacific')!;

describe('the theatre box', () => {
  it('holds Paris and refuses New York in Europe', () => {
    expect(withinTheatre(europe, [2.35, 48.85])).toBe(true);
    expect(withinTheatre(europe, [-74, 40.7])).toBe(false);
  });

  it('reads the Pacific across the antimeridian', () => {
    expect(withinTheatre(pacific, [-157.8, 21.3])).toBe(true);
    expect(withinTheatre(pacific, [139.7, 35.7])).toBe(true);
    expect(withinTheatre(pacific, [2.35, 48.85])).toBe(false);
  });
});

describe('the theatre pace (B1)', () => {
  it('puts Europe near four minutes per thousand kilometres', () => {
    const pace = theatreMinutesPer1000Km(europe);
    expect(pace).toBeGreaterThan(3);
    expect(pace).toBeLessThan(6);
  });

  it('crosses any theatre in fourteen to nineteen minutes', () => {
    for (const theatre of [europe, pacific]) {
      const { west, south, east, north } = theatre.box;
      const heightKm = (north - south) * 111.2;
      const widthKm = (east - west) * 111.2 * Math.cos((((north + south) / 2) * Math.PI) / 180);
      const minutes = (Math.max(heightKm, widthKm) / 1000) * theatreMinutesPer1000Km(theatre);
      expect(minutes).toBeGreaterThanOrEqual(14);
      expect(minutes).toBeLessThanOrEqual(19);
    }
  });
});

describe('the pursuit (B18)', () => {
  it('strikes at contact', () => {
    expect(pursuitVerdict({ gapKm: 20, seen: true, reachKm: 25 })).toBe('strike');
  });

  it('keeps chasing what it still sees', () => {
    expect(pursuitVerdict({ gapKm: 300, seen: true, reachKm: 25 })).toBe('chase');
  });

  it('gives up on what left its sight', () => {
    expect(pursuitVerdict({ gapKm: 300, seen: false, reachKm: 25 })).toBe('lost');
  });

  const minute = 60_000;
  const westward = {
    id: 'a',
    points: [
      [0, 50],
      [10, 50],
    ] as const,
    departedAt: 0,
    arrivesAt: 10 * minute,
  };

  it('dates the contact with a camp on the road', () => {
    const camp = { id: 'b', points: [[5, 50]] as const, departedAt: 0, arrivesAt: 0 };
    const at = contactAt(westward, camp, 25, 0, 10 * minute);
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(4 * minute);
    expect(at!).toBeLessThan(5 * minute);
  });

  it('never meets a faster column running away', () => {
    const runaway = {
      id: 'b',
      points: [
        [3, 50],
        [30, 50],
      ] as const,
      departedAt: 0,
      arrivesAt: 10 * minute,
    };
    expect(contactAt(westward, runaway, 25, 0, 10 * minute)).toBeNull();
  });

  it('catches a slower column', () => {
    const crawler = {
      id: 'b',
      points: [
        [3, 50],
        [6, 50],
      ] as const,
      departedAt: 0,
      arrivesAt: 10 * minute,
    };
    expect(contactAt(westward, crawler, 25, 0, 10 * minute)).not.toBeNull();
  });
});

describe('charge against charge (B17)', () => {
  it('is a shock when the target pursues the attacker', () => {
    expect(passModeOf(['a1'], 'a1')).toBe('shock');
  });

  it('leaves the initiative to whoever strikes a target busy elsewhere', () => {
    expect(passModeOf(['a1'], 'c9')).toBe('initiative');
    expect(passModeOf(['a1'], null)).toBe('initiative');
  });
});

describe('la fin à l’horloge (B11)', () => {
  it('donne la saison au plus gros revenu', () => {
    expect(
      clockVerdict([
        { id: 'a', perMinute: 30, funds: 900 },
        { id: 'b', perMinute: 50, funds: 10 },
      ]),
    ).toEqual({ winnerId: 'b', reason: 'income', perMinute: 50 });
  });

  it('départage par les fonds en caisse, à l’unité', () => {
    expect(
      clockVerdict([
        { id: 'a', perMinute: 50, funds: 120.9 },
        { id: 'b', perMinute: 50, funds: 121.2 },
      ]),
    ).toEqual({ winnerId: 'b', reason: 'income', perMinute: 50 });
  });

  it('déclare l’égalité quand revenu et caisse se valent', () => {
    expect(
      clockVerdict([
        { id: 'a', perMinute: 50, funds: 120.2 },
        { id: 'b', perMinute: 50, funds: 120.9 },
        { id: 'c', perMinute: 10, funds: 999 },
      ]),
    ).toEqual({ winnerId: null, reason: 'draw', perMinute: 50 });
  });
});
