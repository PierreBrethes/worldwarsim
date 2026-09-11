import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import {
  COST_BY_ROLE,
  HQ_LEVEL_AT_LAUNCH,
  MAX_HQ_LEVEL,
  ROLE_SITE_LEVEL,
  STARTING_ALLOY,
  TIER_2_HQ_LEVEL,
  buildCost,
  roleHqLevel,
  unlockLevel,
} from './constants';

/**
 * **Ce que la ligne de départ doit encore payer** (question 51, « le jour où l'on touche
 * `constants` »). Une facture de première projection est un produit de six nombres qui vivent
 * dans quatre paragraphes différents : personne ne la recalcule en changeant l'un d'eux, et la
 * partie de test au Japon a mesuré ce que ça coûte — 577 alliage pour la mer contre 500 de
 * dotation, un mur que rien n'annonçait.
 *
 * Ce fichier **lit les constantes et n'en recopie aucune** : il tombe le jour où la facture
 * repasse au-dessus de la dotation, quel que soit le nombre qu'on aura bougé.
 */

/** Ce que coûte la montée du quartier général du lancement jusqu'au niveau visé. */
const hqClimb = (target: number): number => {
  let alloy = 0;
  for (let level = HQ_LEVEL_AT_LAUNCH + 1; level <= target; level += 1) {
    alloy += buildCost('hq', level).alloy ?? 0;
  }
  return alloy;
};

const firstOf = (key: BuildingKey): number => buildCost(key, 1).alloy ?? 0;

describe('la première projection tient dans la dotation', () => {
  it('par voie de mer : fonderie, quartier général, port, caserne et un cargo', () => {
    const bill =
      firstOf('foundry') +
      hqClimb(unlockLevel('port')) +
      firstOf('barracks') +
      firstOf('port') +
      COST_BY_ROLE.cargo.alloy;

    expect(bill).toBeLessThanOrEqual(STARTING_ALLOY);
  });

  it('par voie de terre : fonderie, quartier général et caserne', () => {
    const bill = firstOf('foundry') + hqClimb(unlockLevel('barracks')) + firstOf('barracks');

    expect(bill).toBeLessThanOrEqual(STARTING_ALLOY);
  });
});

describe('les deux verrous d’un rôle', () => {
  /**
   * **L'arme et son contre arrivent ensemble** (`plan-progression-v1.md`, question 6c). Le
   * blindé passe par deux portes : celle de son site, et celle du quartier général qui arme
   * l'infanterie MK2. `cappedByHq` tient un site sous son quartier général, donc la première
   * suffit à impliquer un QG au niveau du site — la seconde le dit quand même, parce que c'est
   * elle qui ouvre le contre.
   */
  it('n’ouvre jamais le blindé avant le palier qui arme sa réponse', () => {
    expect(ROLE_SITE_LEVEL.armor).toBeGreaterThanOrEqual(TIER_2_HQ_LEVEL);
    expect(roleHqLevel('armor')).toBeGreaterThanOrEqual(TIER_2_HQ_LEVEL);
  });

  /** Un rôle écrit au-dessus du plafond des niveaux serait un rôle caché toute la saison. */
  it('ne demande à aucun site un niveau que rien n’atteint', () => {
    for (const [role, level] of Object.entries(ROLE_SITE_LEVEL) as ReadonlyArray<
      [UnitRole, number]
    >) {
      expect(level, role).toBeGreaterThanOrEqual(1);
      expect(level, role).toBeLessThanOrEqual(MAX_HQ_LEVEL);
    }
  });
});

/**
 * **Le runtime Convex refuse un tiret dans un chemin de module** : `npx convex deploy` s'arrête
 * sur `InvalidConfig` avant même de pousser, alors que `tsc`, `eslint` et `convex-test` ne
 * regardent pas le nom du fichier — le dépôt était vert et ne se déployait pas. Le tiret vient
 * de `src/domain/`, où il reste la règle ; il n'entre pas ici. Les `*.test.ts` sont exclus du
 * bundle par le CLI, donc hors de portée de cette règle.
 */
describe('les noms de modules de convex/', () => {
  const CONVEX_PATH_SEGMENT = /^[A-Za-z0-9_.]+$/;

  const modulePathsUnder = (directory: string, prefix = ''): ReadonlyArray<string> =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        return entry.name === '_generated'
          ? []
          : modulePathsUnder(join(directory, entry.name), relative);
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
      return [relative];
    });

  it('n’emploient que des lettres, des chiffres, des points et des tirets bas', () => {
    const offenders = modulePathsUnder(import.meta.dirname).filter((path) =>
      path.split('/').some((segment) => !CONVEX_PATH_SEGMENT.test(segment)),
    );

    expect(
      offenders,
      `Le runtime Convex refuse ces chemins : chaque segment sous convex/ ne peut porter que des caractères alphanumériques, des tirets bas ou des points. Renommer en camelCase.`,
    ).toEqual([]);
  });
});
