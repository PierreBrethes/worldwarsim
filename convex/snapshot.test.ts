import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

/**
 * **L'export de l'état de référence ne doit jamais rendre une vue vide.** Un instantané qui sort
 * sans bruit sur un jeton mort produit un document plausible et faux — la panne exacte que le
 * chantier du 06/09 répare, où `ETAT-REFERENCE.md` décrivait un jeu que personne ne jouait. Le
 * jeton passe donc par `playerByToken` comme toute autre porte, et il échoue.
 */
describe('dev.snapshot', () => {
  it('refuse un jeton inconnu plutôt que de servir une vue vide', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(internal.dev.snapshot, { token: 'inconnu' })).rejects.toThrow(
      'UNKNOWN_TOKEN',
    );
  });
});
