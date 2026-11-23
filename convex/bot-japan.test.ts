import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { crossesToward, MIDDAY } from './bot.fixture';

/**
 * **Ce cas tient près du plafond de plein du cargo** : Tokyo à Hong Kong fait 3120 km par mer, le
 * cargo en franchit 3000 (six crans de `FUEL_STEP_KM`), et seules les plages à 150 km et plus de
 * Hong Kong (2990 km au mieux) sont à sa portée. Si ce test casse après une régénération de la
 * grille ou de la côte, regarder d'abord le port choisi (`portSite` : la route de mer la plus
 * courte vers le point) et la plage retenue (`landingFor`) : un cran de trop, et la traversée
 * devient `NO_LANDING`, ce que `seaWaiting` dit.
 */
describe("un bot insulaire débarque près d'un point neutre (japan)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it(
    'un cargo porte sa colonne près de Hong Kong, que la grille noie',
    () => crossesToward('japan', 'hongKong', false),
    600_000,
  );
});
