/**
 * **Retoucher l'objet dont la feuille est ouverte la ferme** (#584), au téléphone seul : le doigt
 * qui revient sur ce qu'il a déjà désigné n'ouvre pas une seconde fiche, il lève celle qui couvre
 * la carte. Au bureau, le cartouche reste posé et le clic le déplace.
 */
export const retouches = (
  narrow: boolean,
  open: { readonly id: string } | null | undefined,
  id: string,
): boolean => narrow && open?.id === id;
