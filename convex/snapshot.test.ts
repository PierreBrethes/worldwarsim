import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { foundSeat } from './seats.fixture';
import { modules } from './test.setup';

/**
 * **L'export de l'état de référence ne doit jamais rendre une vue vide.** Un instantané qui sort
 * sans bruit sur une place morte produit un document plausible et faux — la panne exacte que le
 * chantier du 06/09 répare, où `ETAT-REFERENCE.md` décrivait un jeu que personne ne jouait. La
 * session passe donc par `playerOf` comme toute autre porte, et elle échoue.
 */
describe('dev.snapshot', () => {
  it('refuse une session inconnue plutôt que de servir une vue vide', async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const { seat } = await foundSeat(t);
    await expect(t.query(internal.dev.snapshot, { ...seat, token: 'inconnu' })).rejects.toThrow(
      'UNKNOWN_SESSION',
    );
  });
});
