import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EtiquetteCarte } from '@/domaine/etiquettes';
import {
  CATEGORIE_DE_TYPE,
  chantierOublie,
  marqueDe,
  marqueLaPlusForte,
  regrouper,
  type BasculesIndicateurs,
  type GroupeIndicateur,
  type IndicateurBrut,
  type MarqueAlerte,
} from '@/domaine/indicateurs';
import { GlypheIndicateur } from '@/coque/GlypheIndicateur';
import type { ProjectionEtiquette } from './moteur/etiquettes';
import type { MoteurCarte } from './moteur';

/**
 * Le bord d'écran. Une entité sortie du champ n'est pas perdue : son étiquette se rabat sur
 * l'arête, ergot pointé vers sa direction réelle, et le clic ramène la caméra dessus.
 *
 * Deux cadences, jamais mélangées : la position suit la caméra à l'image, écrite en
 * `transform` sur le nœud d'ancre ; l'agrégation, qui décide *quels* nœuds existent, ne se
 * recalcule qu'au repos de l'orbite. Regrouper par image ferait clignoter les comptes à chaque
 * degré d'orbite, et pour un résultat que personne n'aurait le temps de lire.
 *
 * Classes stylées dans `src/styles/indicateurs.css` :
 * `indicateur--<catégorie>` · `--agrege` · `--menace | --offensive | --imminente` ·
 * `--attention`.
 */
export function IndicateursBord({
  etiquettes,
  moteur,
  bascules,
}: {
  etiquettes: ReadonlyArray<EtiquetteCarte>;
  moteur: MoteurCarte | null;
  bascules: BasculesIndicateurs;
}) {
  const retenues = useMemo(
    () =>
      new Map(
        etiquettes
          .filter((etiquette) => bascules[CATEGORIE_DE_TYPE[etiquette.type]])
          .map((etiquette) => [etiquette.id, etiquette] as const),
      ),
    [etiquettes, bascules],
  );

  const [groupes, setGroupes] = useState<ReadonlyArray<GroupeIndicateur>>([]);
  const ancres = useRef(new Map<string, HTMLElement>());
  const ergots = useRef(new Map<string, HTMLElement>());
  const racines = useRef(new Map<string, HTMLElement>());
  const dernieres = useRef<ReadonlyArray<ProjectionEtiquette>>([]);

  const composer = useCallback(() => {
    const bruts = dernieres.current.flatMap<IndicateurBrut>((projection) => {
      const etiquette = retenues.get(projection.id);
      if (!projection.auBord || etiquette === undefined) return [];
      return [
        {
          id: projection.id,
          categorie: CATEGORIE_DE_TYPE[etiquette.type],
          priorite: etiquette.priorite,
          x: projection.bordX,
          y: projection.bordY,
        },
      ];
    });
    const composes = regrouper(bruts);
    setGroupes((precedents) => (memesGroupes(precedents, composes) ? precedents : composes));
  }, [retenues]);

  // Une catégorie qu'on vient d'allumer ne peut pas attendre le prochain repos de caméra : la
  // bascule est un geste, et un geste sans effet immédiat passe pour un geste raté.
  useEffect(composer, [composer]);

  useEffect(() => {
    if (!moteur) return;
    return moteur.abonnerRepos(composer);
  }, [moteur, composer]);

  const cumuls = useMemo(
    () => groupes.map(() => ({ x: 0, y: 0, cosinus: 0, sinus: 0, compte: 0 })),
    [groupes],
  );

  const appartenance = useMemo(() => {
    const table = new Map<string, number>();
    groupes.forEach((groupe, rang) => {
      for (const membre of groupe.membres) table.set(membre, rang);
    });
    return table;
  }, [groupes]);

  useEffect(() => {
    if (!moteur) return;
    moteur.onBords = (projections) => {
      dernieres.current = projections;
      for (const cumul of cumuls) {
        cumul.x = cumul.y = cumul.cosinus = cumul.sinus = cumul.compte = 0;
      }

      for (const projection of projections) {
        if (!projection.auBord) continue;
        const rang = appartenance.get(projection.id);
        if (rang === undefined) continue;
        const cumul = cumuls[rang];
        if (cumul === undefined) continue;
        cumul.x += projection.bordX;
        cumul.y += projection.bordY;
        // Les caps se moyennent en vecteurs, jamais en angles : deux membres à ±180° donneraient
        // un ergot pointé vers le centre de l'écran.
        cumul.cosinus += Math.cos(projection.cap);
        cumul.sinus += Math.sin(projection.cap);
        cumul.compte += 1;
      }

      groupes.forEach((groupe, rang) => {
        const ancre = ancres.current.get(groupe.id);
        const cumul = cumuls[rang];
        if (!ancre || cumul === undefined) return;
        if (cumul.compte === 0) {
          ancre.style.display = 'none';
          return;
        }
        ancre.style.display = '';
        ancre.style.transform = `translate3d(${cumul.x / cumul.compte}px, ${cumul.y / cumul.compte}px, 0)`;
        const ergot = ergots.current.get(groupe.id);
        if (ergot) ergot.style.transform = `rotate(${Math.atan2(cumul.sinus, cumul.cosinus)}rad)`;
      });
    };
    return () => {
      moteur.onBords = () => {};
    };
  }, [moteur, groupes, cumuls, appartenance]);

  // La marque d'alerte tombe à l'échéance, pas à l'image : une seconde de battement suffit et
  // c'est la même cadence que les comptes à rebours des étiquettes.
  useEffect(() => {
    const appliquer = () => {
      const maintenant = Date.now();
      for (const groupe of groupes) {
        const racine = racines.current.get(groupe.id);
        if (!racine) continue;
        const membres = groupe.membres
          .map((membre) => retenues.get(membre))
          .filter((etiquette): etiquette is EtiquetteCarte => etiquette !== undefined);
        const marque = marqueLaPlusForte(membres.map((membre) => marqueDe(membre, maintenant)));
        for (const nom of MARQUES) racine.classList.toggle(`indicateur--${nom}`, marque === nom);
        racine.classList.toggle(
          'indicateur--attention',
          membres.some((membre) => chantierOublie(membre, maintenant)),
        );
      }
    };
    appliquer();
    const minuteur = setInterval(appliquer, 1000);
    return () => clearInterval(minuteur);
  }, [groupes, retenues]);

  return (
    <div className="indicateurs-bord">
      {groupes.map((groupe) => (
        <div
          key={groupe.id}
          className="indicateur-ancre"
          style={{ display: 'none' }}
          ref={(noeud) => {
            enregistrer(ancres.current, groupe.id, noeud);
          }}
        >
          <button
            type="button"
            title={titreDe(groupe, retenues)}
            style={{ zIndex: groupe.priorite }}
            className={`indicateur indicateur--${groupe.categorie}${groupe.membres.length > 1 ? ' indicateur--agrege' : ''}`}
            ref={(noeud) => {
              enregistrer(racines.current, groupe.id, noeud);
            }}
            onClick={() => moteur?.voyagerVers(groupe.membres)}
          >
            <span
              className="indicateur-ergot"
              ref={(noeud) => {
                enregistrer(ergots.current, groupe.id, noeud);
              }}
            >
              <span className="indicateur-ergot-trait" />
            </span>
            <span className="indicateur-triangle" aria-hidden>
              <svg viewBox="0 0 20 20">
                <path d="M10 1.8 18.4 17.2H1.6z" />
              </svg>
            </span>
            {groupe.membres.length > 1 && (
              <span className="indicateur-doublure">
                <GlypheIndicateur categorie={groupe.categorie} taille={17} />
              </span>
            )}
            <span className="indicateur-glyphe">
              <GlypheIndicateur categorie={groupe.categorie} taille={17} />
            </span>
            {groupe.membres.length > 1 && (
              <span className="indicateur-compte">{groupe.membres.length}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

const MARQUES: ReadonlyArray<MarqueAlerte> = ['menace', 'offensive', 'imminente'];

function titreDe(
  groupe: GroupeIndicateur,
  retenues: ReadonlyMap<string, EtiquetteCarte>,
): string {
  const nature = LIBELLE_CATEGORIE[groupe.categorie];
  if (groupe.membres.length > 1) return `${groupe.membres.length} ${nature} hors champ`;
  const premier = groupe.membres[0];
  const etiquette = premier === undefined ? undefined : retenues.get(premier);
  const mention = etiquette?.lignes.find((ligne) => ligne.role === 'nature');
  return mention && mention.role === 'nature' ? `${mention.texte} — hors champ` : `${nature} hors champ`;
}

const LIBELLE_CATEGORIE: Readonly<Record<GroupeIndicateur['categorie'], string>> = {
  'avant-postes': 'avant-postes',
  chantiers: 'chantiers',
  forces: 'forces',
  'mes-mouvements': 'mouvements',
  'cap-sur-moi': 'mouvements cap sur moi',
  renseignement: 'contacts',
};

function enregistrer(carte: Map<string, HTMLElement>, id: string, noeud: HTMLElement | null): void {
  if (noeud) carte.set(id, noeud);
  else carte.delete(id);
}

/** Le repos de caméra rejoue le calcul : sans cette comparaison, il rendrait la couche à vide. */
function memesGroupes(
  premiers: ReadonlyArray<GroupeIndicateur>,
  seconds: ReadonlyArray<GroupeIndicateur>,
): boolean {
  return (
    premiers.length === seconds.length &&
    premiers.every((groupe, rang) => {
      const autre = seconds[rang];
      return (
        autre !== undefined &&
        groupe.id === autre.id &&
        groupe.membres.length === autre.membres.length &&
        groupe.membres.every((membre, place) => membre === autre.membres[place])
      );
    })
  );
}
