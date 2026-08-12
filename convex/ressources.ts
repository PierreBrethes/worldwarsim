import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { stockAccumule } from '../src/domaine/hors-saison';

export type CleRessource = 'ravitaillement' | 'acier' | 'effectifs';
export type Couts = Readonly<Record<CleRessource, number>>;

const LIBELLE: Readonly<Record<CleRessource, string>> = {
  ravitaillement: 'ravitaillement',
  acier: 'acier',
  effectifs: 'effectifs',
};

export async function ligneRessource(
  ctx: QueryCtx,
  joueurId: Id<'joueurs'>,
  cle: CleRessource,
) {
  const lignes = await ctx.db
    .query('ressources')
    .withIndex('parJoueur', (q) => q.eq('joueurId', joueurId))
    .collect();
  const ligne = lignes.find((candidate) => candidate.cle === cle);
  if (!ligne) throw new Error(`ressource absente : ${cle}`);
  return ligne;
}

/**
 * Les trois stocks sont vérifiés avant qu'aucun ne soit débité : une dépense partielle
 * laisserait un joueur amputé de son ravitaillement sans avoir rien reçu, et rien ici ne
 * sait revenir en arrière.
 */
export async function debiter(
  ctx: MutationCtx,
  joueurId: Id<'joueurs'>,
  couts: Couts,
  maintenant: number,
): Promise<void> {
  const lignes = await ctx.db
    .query('ressources')
    .withIndex('parJoueur', (q) => q.eq('joueurId', joueurId))
    .collect();

  const prevues = (Object.keys(LIBELLE) as ReadonlyArray<CleRessource>).map((cle) => {
    const ligne = lignes.find((candidate) => candidate.cle === cle);
    if (!ligne) throw new Error(`ressource absente : ${cle}`);
    const disponible = stockAccumule(ligne, maintenant, ligne.plafond ?? undefined);
    const cout = couts[cle];
    if (disponible < cout) {
      throw new Error(
        `il faut ${cout} de ${LIBELLE[cle]} (${Math.floor(disponible)} disponibles)`,
      );
    }
    return { ligne, restant: disponible - cout };
  });

  for (const { ligne, restant } of prevues) {
    await ctx.db.patch(ligne._id, { stock: restant, majLe: maintenant });
  }
}

/**
 * Le remboursement d'un lot annulé. Il respecte le plafond : rendre des effectifs au-delà de la
 * conscription les ferait disparaître au prochain calcul, autant les écrêter tout de suite.
 */
export async function crediter(
  ctx: MutationCtx,
  joueurId: Id<'joueurs'>,
  gains: Couts,
  maintenant: number,
): Promise<void> {
  const lignes = await ctx.db
    .query('ressources')
    .withIndex('parJoueur', (q) => q.eq('joueurId', joueurId))
    .collect();

  for (const cle of Object.keys(LIBELLE) as ReadonlyArray<CleRessource>) {
    const ligne = lignes.find((candidate) => candidate.cle === cle);
    if (!ligne) throw new Error(`ressource absente : ${cle}`);
    const plafond = ligne.plafond ?? undefined;
    const rendu = stockAccumule(ligne, maintenant, plafond) + gains[cle];
    await ctx.db.patch(ligne._id, {
      stock: plafond === undefined ? rendu : Math.min(rendu, plafond),
      majLe: maintenant,
    });
  }
}
