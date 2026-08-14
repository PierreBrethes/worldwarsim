import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { enHeuresMinutes } from '@/domaine/duree';
import { URGENCE_MS, estCompte, type EtiquetteCarte, type PictoEtiquette } from '@/domaine/etiquettes';
import { Picto, type NomPicto } from '@/coque/GlypheIndicateur';
import type { NiveauDetail, ProjectionEtiquette } from './moteur/etiquettes';
import type { MoteurCarte } from './moteur';

/**
 * La couche d'étiquettes du plateau. Un nœud DOM par étiquette, déplacé par `transform` depuis
 * la boucle du moteur : React rend la liste quand la vue change, jamais à l'image. Les comptes
 * à rebours se réécrivent une fois par seconde, directement dans le nœud de texte.
 *
 * La maquette ne nomme aucune classe — elle est écrite en styles en ligne. Celles-ci sont donc
 * posées ici et stylées dans `src/styles/etiquettes.css` :
 *
 * - `etiquettes-carte` — la couche, transparente au pointeur ;
 * - `etiquette-ancre` — le nœud que la boucle déplace ;
 * - `etiquette` — la racine ; porte tous les états ;
 * - `etiquette--avant-poste | --pile | --chantier | --mouvement-mien |
 *   --mouvement-cap-sur-moi | --renseignement` — le type ;
 * - `etiquette--glyphe | --deployee` — le niveau de détail ;
 * - `etiquette--urgente` — il reste moins de cinq minutes ;
 * - `etiquette--identifie` — mouvement adverse percé par le renseignement ;
 * - `etiquette--cliquable` — le clic sélectionne le pays hôte ;
 * - `etiquette-bloc`, `etiquette-barre`, `etiquette-picto`,
 *   `etiquette-ligne--nature | --chiffres | --effectif | --compte | --mention` — l'anatomie.
 *
 * L'anatomie ne compte qu'un trait : la barre d'encre nationale longe le texte puis descend
 * jusqu'à l'ancre. La maquette en dessinait deux — une barre et un appel plus fin — et plantait
 * le picto au sol ; ici il tient au texte, de l'autre côté de la barre, et c'est la flaque
 * d'ombre qui tient lieu de socle.
 */
export function EtiquettesCarte({
  etiquettes,
  moteur,
  onSurvolMouvement,
  onSelection,
  onMenuContextuel,
}: {
  etiquettes: ReadonlyArray<EtiquetteCarte>;
  moteur: MoteurCarte | null;
  onSurvolMouvement: (id: string | null) => void;
  onSelection: (nom: string | null) => void;
  onMenuContextuel: (etiquette: EtiquetteCarte, clientX: number, clientY: number) => void;
}) {
  const ancres = useRef(new Map<string, HTMLElement>());
  const racines = useRef(new Map<string, HTMLElement>());
  const blocs = useRef(new Map<string, HTMLElement>());
  const comptes = useRef(new Map<string, HTMLElement>());
  const etats = useRef(new Map<string, EtatRendu>());

  const appliquer = useCallback((id: string, etat: EtatRendu) => {
    const racine = racines.current.get(id);
    if (!racine) return;
    const deployee = etat.lod === 'deployee' && !etat.rabattue;
    racine.classList.toggle('etiquette--deployee', deployee);
    racine.classList.toggle('etiquette--glyphe', !deployee);
  }, []);

  /**
   * Le dégradé au chevauchement, par priorité décroissante : la moins prioritaire des deux qui
   * se recouvrent retombe au glyphe.
   *
   * L'ordre des deux boucles est tout : on déploie **d'abord** tout le monde dans le DOM, on
   * mesure ensuite. Mesurer avant de déployer lisait la largeur repliée du tour précédent —
   * chaque étiquette semblait alors tenir dans son coin, aucune n'était rabattue, et le paquet
   * illisible se reformait. C'est un dégradé qui se contredisait lui-même d'un tour à l'autre.
   */
  const degrader = useCallback(() => {
    const candidates = etiquettes
      .filter((etiquette) => {
        const etat = etats.current.get(etiquette.id);
        return etat?.visible === true && etat.lod === 'deployee';
      })
      .slice()
      .sort((premiere, seconde) => seconde.priorite - premiere.priorite);

    for (const etiquette of etiquettes) {
      const etat = etats.current.get(etiquette.id);
      if (!etat) continue;
      etat.rabattue = false;
      appliquer(etiquette.id, etat);
    }

    const retenues: DOMRect[] = [];
    for (const etiquette of candidates) {
      const bloc = blocs.current.get(etiquette.id);
      const etat = etats.current.get(etiquette.id);
      if (!bloc || !etat) continue;
      const cadre = bloc.getBoundingClientRect();
      etat.rabattue = retenues.some((retenue) => seChevauchent(retenue, cadre));
      if (!etat.rabattue) retenues.push(cadre);
      appliquer(etiquette.id, etat);
    }
  }, [etiquettes, appliquer]);

  const rafraichirComptes = useCallback(() => {
    const maintenant = Date.now();
    for (const etiquette of etiquettes) {
      const compte = etiquette.lignes.find(estCompte);
      const noeud = comptes.current.get(etiquette.id);
      if (compte === undefined || noeud === undefined) continue;
      const reste = Math.max(0, compte.echeanceA - maintenant);
      noeud.textContent = `${compte.prefixe}${enHeuresMinutes(reste / 60_000)}`;
      racines.current.get(etiquette.id)?.classList.toggle('etiquette--urgente', reste < URGENCE_MS);
    }
  }, [etiquettes]);

  useLayoutEffect(() => {
    etats.current = new Map(
      etiquettes.map((etiquette) => [etiquette.id, { visible: false, lod: 'glyphe', rabattue: false }]),
    );
    rafraichirComptes();
  }, [etiquettes, rafraichirComptes]);

  // Le repos de caméra ne suffit pas aux étiquettes de fil : leur ancre est une tête de
  // mouvement, qui avance alors que rien ne bouge à l'écran. Sans ce tour de piste, deux
  // jalons qui se rejoignent restent déployés l'un sur l'autre jusqu'à ce qu'on touche la
  // souris. Une mesure par seconde, la même que celle des comptes à rebours.
  useEffect(() => {
    const minuteur = setInterval(() => {
      rafraichirComptes();
      degrader();
    }, 1000);
    return () => clearInterval(minuteur);
  }, [rafraichirComptes, degrader]);

  useEffect(() => {
    if (!moteur) return;
    moteur.definirAncresEtiquettes(etiquettes.map(({ id, ancre }) => ({ id, ancre })));
  }, [moteur, etiquettes]);

  useEffect(() => {
    if (!moteur) return;
    moteur.onEtiquettes = (projections: ReadonlyArray<ProjectionEtiquette>) => {
      for (const projection of projections) {
        const ancre = ancres.current.get(projection.id);
        const etat = etats.current.get(projection.id);
        if (!ancre || !etat) continue;

        if (projection.visible !== etat.visible) {
          etat.visible = projection.visible;
          ancre.style.display = projection.visible ? '' : 'none';
        }
        if (!projection.visible) continue;

        ancre.style.transform = `translate3d(${projection.x}px, ${projection.y}px, 0)`;
        if (projection.lod !== etat.lod) {
          etat.lod = projection.lod;
          appliquer(projection.id, etat);
        }
      }
    };
    const desabonner = moteur.abonnerRepos(degrader);
    return () => {
      moteur.onEtiquettes = () => {};
      desabonner();
    };
  }, [moteur, appliquer, degrader]);

  return (
    <div className="etiquettes-carte">
      {etiquettes.map((etiquette) => (
        <div
          key={etiquette.id}
          className="etiquette-ancre"
          ref={(noeud) => {
            enregistrer(ancres.current, etiquette.id, noeud);
          }}
          style={{ display: 'none' }}
        >
          <div
            ref={(noeud) => {
              enregistrer(racines.current, etiquette.id, noeud);
            }}
            className={classesDe(etiquette)}
            style={
              etiquette.encre === null
                ? undefined
                : ({ '--encre-etiquette': etiquette.encre } as CSSProperties)
            }
            onPointerEnter={() => {
              if (etiquette.ancre.genre === 'teteMouvement') onSurvolMouvement(etiquette.ancre.arc);
            }}
            onPointerLeave={() => {
              if (etiquette.ancre.genre === 'teteMouvement') onSurvolMouvement(null);
            }}
            onClick={() => {
              if (etiquette.paysHote !== null) onSelection(etiquette.paysHote);
            }}
            onContextMenu={(evenement) => {
              evenement.preventDefault();
              onMenuContextuel(etiquette, evenement.clientX, evenement.clientY);
            }}
          >
            <div
              className="etiquette-bloc"
              ref={(noeud) => {
                enregistrer(blocs.current, etiquette.id, noeud);
              }}
            >
              {etiquette.picto !== null && (
                <span className="etiquette-picto">
                  <Picto picto={PICTO_DE_LETIQUETTE[etiquette.picto]} corps={40} taille={36} />
                </span>
              )}
              <span className="etiquette-barre" />
              <div>
                {etiquette.lignes.map((ligne, rang) =>
                  ligne.role === 'compte' ? (
                    <div
                      key={rang}
                      className="etiquette-ligne etiquette-ligne--compte"
                      ref={(noeud) => {
                        enregistrer(comptes.current, etiquette.id, noeud);
                      }}
                    />
                  ) : (
                    <div key={rang} className={`etiquette-ligne etiquette-ligne--${ligne.role}`}>
                      {ligne.texte}
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** « pile » est le mot du domaine, « forces » celui du dessin — la même chose vue de deux côtés. */
const PICTO_DE_LETIQUETTE: Readonly<Record<PictoEtiquette, NomPicto>> = {
  'avant-poste': 'avant-poste',
  pile: 'forces',
  chantier: 'chantier',
};

type EtatRendu = { visible: boolean; lod: NiveauDetail; rabattue: boolean };

function enregistrer(carte: Map<string, HTMLElement>, id: string, noeud: HTMLElement | null): void {
  if (noeud) carte.set(id, noeud);
  else carte.delete(id);
}

function classesDe(etiquette: EtiquetteCarte): string {
  return [
    'etiquette',
    'etiquette--glyphe',
    `etiquette--${etiquette.type}`,
    etiquette.identifie ? 'etiquette--identifie' : '',
    etiquette.paysHote === null ? '' : 'etiquette--cliquable',
  ]
    .filter(Boolean)
    .join(' ');
}

/** L'écart minimum de la maquette : 28 px entre deux étiquettes, soit 14 px de marge chacune. */
const MARGE_CHEVAUCHEMENT = 14;

const seChevauchent = (premiere: DOMRect, seconde: DOMRect): boolean =>
  premiere.left - MARGE_CHEVAUCHEMENT < seconde.right + MARGE_CHEVAUCHEMENT &&
  premiere.right + MARGE_CHEVAUCHEMENT > seconde.left - MARGE_CHEVAUCHEMENT &&
  premiere.top - MARGE_CHEVAUCHEMENT < seconde.bottom + MARGE_CHEVAUCHEMENT &&
  premiere.bottom + MARGE_CHEVAUCHEMENT > seconde.top - MARGE_CHEVAUCHEMENT;
