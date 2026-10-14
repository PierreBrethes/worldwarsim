import { describe, expect, it } from 'vitest';
import {
  blitzRecruitRefusalOf,
  fundsAt,
  incomePerMinute,
  mendPlan,
  mendStep,
  rolesFormedBy,
} from './blitz';

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
  const ok = { role: 'infantry', funds: 1_000, troops: 0 } as const;

  it('forme dans le bâtiment de son domaine, et l’infanterie au QG', () => {
    expect(rolesFormedBy('hq')).toEqual(['infantry']);
    expect(rolesFormedBy('port')).toEqual(['escort', 'cargo', 'carrier']);
    expect(rolesFormedBy('city')).toEqual([]);
    expect(blitzRecruitRefusalOf({ ...ok, site: 'hq' })).toBeNull();
    expect(blitzRecruitRefusalOf({ ...ok, site: 'hq', role: 'armor' })).toBe(
      'WRONG_PROJECTION_BUILDING',
    );
    expect(blitzRecruitRefusalOf({ ...ok, site: 'airfield', role: 'bomber' })).toBeNull();
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

  it('rend un dixième de la force par pas, au prix du rôle', () => {
    expect(mendStep(infantry, 100)).toEqual({ strength: 25, cost: 3 });
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
      4,
    );
    expect(plan.map((step) => [step.troop.id, step.cost])).toEqual([['a', 3]]);
  });
});
