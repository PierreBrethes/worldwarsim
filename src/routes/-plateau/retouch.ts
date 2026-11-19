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

/** La sélection qui suit un toucher : `null` quand le doigt revient sur ce qui est ouvert (au
 *  téléphone), la nouvelle sinon. Lue sur l'état précédent, jamais sur une copie de rendu. */
export const sheetAfterTouch = <T extends { readonly id: string }>(
  narrow: boolean,
  previous: { readonly id: string } | null,
  next: T,
): T | null => (retouches(narrow, previous, next.id) ? null : next);

/** Sa fiche de site est ouverte sur ce bâtiment : y retoucher la ferme. */
export const siteRetouched = (
  narrow: boolean,
  windows: ReadonlyArray<string>,
  focused: string | undefined,
  buildingId: string,
): boolean =>
  retouches(narrow, windows.includes('site') ? { id: focused ?? '' } : null, buildingId);

/** Sa garnison est ouverte sur cette station : y retoucher la ferme. */
export const garrisonRetouched = (
  narrow: boolean,
  openStationKey: string | null,
  stationKey: string,
): boolean =>
  retouches(narrow, openStationKey === null ? null : { id: openStationKey }, stationKey);

/** Une fermeture qui lâche d'abord le cadrage demandé à l'ouverture : un cran lâché ensuite ne
 *  doit pas ramener la carte sur ce qu'on vient de fermer. */
export const forgetThen = (forget: () => void, close: () => void) => () => {
  forget();
  close();
};
