import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { enHeuresMinutes } from '@/domaine/duree';
import {
  URGENCE_MS,
  type EtiquetteCarte,
  type LigneEtiquette,
  type PictoEtiquette,
} from '@/domaine/etiquettes';
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
 * - `etiquette-glyphe`, `etiquette-bloc`, `etiquette-barre`,
 *   `etiquette-ligne--nature | --chiffres | --effectif | --compte | --mention` — l'anatomie.
 *
 * L'anatomie ne compte qu'un trait : la barre d'encre nationale longe le texte puis descend
 * jusqu'au socle. La maquette en dessinait deux — une barre et un appel plus fin.
 */
export function EtiquettesCarte({
  etiquettes,
  moteur,
  onSurvolMouvement,
  onSelection,
}: {
  etiquettes: ReadonlyArray<EtiquetteCarte>;
  moteur: MoteurCarte | null;
  onSurvolMouvement: (id: string | null) => void;
  onSelection: (nom: string | null) => void;
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

  // Le dégradé au chevauchement mesure du DOM : il ne se calcule qu'au repos de la caméra, et
  // par priorité décroissante — la moins prioritaire des deux qui se recouvrent retombe.
  const degrader = useCallback(() => {
    const retenues: DOMRect[] = [];
    const candidates = etiquettes
      .filter((etiquette) => {
        const etat = etats.current.get(etiquette.id);
        return etat?.visible === true && etat.lod === 'deployee';
      })
      .slice()
      .sort((premiere, seconde) => seconde.priorite - premiere.priorite);

    for (const etiquette of etiquettes) {
      const etat = etats.current.get(etiquette.id);
      if (etat) etat.rabattue = false;
    }

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

  useEffect(() => {
    const minuteur = setInterval(rafraichirComptes, 1000);
    return () => clearInterval(minuteur);
  }, [rafraichirComptes]);

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
    moteur.onReposCamera = degrader;
    return () => {
      moteur.onEtiquettes = () => {};
      moteur.onReposCamera = () => {};
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
          >
            <span className="etiquette-glyphe">
              <PictoSocle picto={etiquette.picto} />
            </span>
            <div
              className="etiquette-bloc"
              ref={(noeud) => {
                enregistrer(blocs.current, etiquette.id, noeud);
              }}
            >
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

/**
 * Pictos provisoires. Ils tiennent la place des vraies planches, qui suivront le point de
 * départ du trajet : quand elles arriveront, seul ce composant change.
 */
function PictoSocle({ picto }: { picto: PictoEtiquette | null }) {
  if (picto === null) return null;
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="block h-full w-full"
    >
      {picto === 'extraction' && <path d="M2 13 L7 2 L12 13 M4.4 9 H9.6" />}
      {picto === 'relais' && <path d="M4 13 V1.5 M4 2 L11 4.6 L4 7.2" />}
      {picto === 'ecoute' && (
        <>
          <path d="M7 13 V6.5" />
          <path d="M3 6.5 A4 4 0 0 1 11 6.5" />
          <path d="M5 6.5 A2 2 0 0 1 9 6.5" />
        </>
      )}
      {picto === 'pile' && <path d="M1.5 4 H12.5 M1.5 7.5 H12.5 M1.5 11 H8.5" />}
      {picto === 'chantier' && <path d="M3.5 13 V2 H12 M3.5 4.5 L9.5 13 M12 2 V5.5" />}
    </svg>
  );
}

type EtatRendu = { visible: boolean; lod: NiveauDetail; rabattue: boolean };

const estCompte = (ligne: LigneEtiquette): ligne is Extract<LigneEtiquette, { role: 'compte' }> =>
  ligne.role === 'compte';

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
