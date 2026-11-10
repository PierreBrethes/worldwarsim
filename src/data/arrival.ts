/**
 * **On arrive** : l'adresse nue (`/`) ou la connexion viennent de mener à l'accueil. L'accueil
 * le lit à son montage (`peekArrival`, sans effet : un rendu se rejoue), puis l'efface ; il
 * conduit alors droit à la seule partie qui attend. Venu d'ailleurs — le plateau, un salon
 * qu'on quitte —, on voulait la une de son édition, et on y reste.
 *
 * En mémoire et nulle part ailleurs : une page rechargée n'arrive pas, elle y est déjà.
 */
let arriving = false;

export const announceArrival = (): void => {
  arriving = true;
};

export const peekArrival = (): boolean => arriving;

export const takeArrival = (): void => {
  arriving = false;
};
