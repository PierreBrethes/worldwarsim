/**
 * **Ce qui fait d'un lieu une cible d'attaque** (ADR 0024 §4) : il porte quelque chose que
 * l'observateur a **relevé**. Sur du vide, la rose ne propose rien — attaquer du vide ne sert à
 * rien — et le serveur refuse du même mot (`NOTHING_TO_ATTACK`).
 *
 * ⚠️ **Tout se lit dans le relevé du joueur, jamais dans la vérité du plateau.** Poser la question
 * à l'état serveur dirait au joueur qu'il y a quelque chose là où il croyait viser du vide : le
 * menu percerait le brouillard que le reste du jeu tient (ADR 0005). Un relevé périmé qui laisse
 * l'option ouverte est donc un comportement **correct** — le serveur résoudra une bredouille, et
 * c'est le prix assumé de ne jamais rien révéler.
 *
 * La région est la seule clé qu'un relevé d'installation porte (`regionSightings`), donc c'est par
 * la région que la question se pose — des deux côtés du fil, sur la même fonction.
 */
export const carriesSurveyedInstallation = (
  regionId: string | null,
  surveyed: ReadonlyArray<{ readonly regionId: string }>,
): boolean =>
  regionId !== null && surveyed.some((installation) => installation.regionId === regionId);
