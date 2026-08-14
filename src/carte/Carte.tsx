import { useCallback, useEffect, useRef, useState } from 'react';
import { chargerRegions, type Monde } from '@/domaine/monde';
import type { EtiquetteCarte } from '@/domaine/etiquettes';
import type { BasculesIndicateurs } from '@/domaine/indicateurs';
import type { ActionRose, CibleRose, Rose } from '@/domaine/rose-des-vents';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { graverRappelGestesVu, lireEchelleHud, rappelGestesVu } from '@/donnees/reglages';
import { CarteDesCommandes } from './CarteDesCommandes';
import { EchelleTrajet } from './EchelleTrajet';
import { EtiquettesCarte } from './EtiquettesCarte';
import { IndicateursBord } from './IndicateursBord';
import { RoseDesVents } from './RoseDesVents';
import { MoteurCarte, type SurvolCarte } from './moteur';

type Props = {
  monde: Monde;
  arcs: ReadonlyArray<ArcAffiche>;
  etiquettes: ReadonlyArray<EtiquetteCarte>;
  encreParPays: ReadonlyMap<string, string>;
  paysSelectionne: string | null;
  nationJoueur: string | null;
  /** Les catégories dont les entités hors champ se rabattent au bord de l'écran. */
  indicateurs: BasculesIndicateurs;
  /** L'identifiant du mouvement que la frise désigne — l'arc correspondant monte en intensité. */
  mouvementAccentue: string | null;
  onSelection: (nom: string | null) => void;
  onSurvolRegion?: (nom: string | null) => void;
  onSurvolArc?: (id: string | null) => void;
  onSurvolEtiquette?: (id: string | null) => void;
  /** Ce que la cible autorise. La carte pose la question ; elle ne connaît pas la vue. */
  roseDe: (cible: CibleRose) => Rose | null;
  onActionRose: (action: ActionRose) => void;
};

export function Carte({
  monde,
  arcs,
  etiquettes,
  encreParPays,
  paysSelectionne,
  nationJoueur,
  indicateurs,
  mouvementAccentue,
  onSelection,
  onSurvolRegion,
  onSurvolArc,
  onSurvolEtiquette,
  roseDe,
  onActionRose,
}: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const moteur = useRef<MoteurCarte | null>(null);
  const [survol, setSurvol] = useState<SurvolCarte>(null);
  const [rose, setRose] = useState<RoseOuverte | null>(null);
  const [rappelGestes, setRappelGestes] = useState(false);
  // La couche d'étiquettes ne peut se brancher qu'une fois le moteur construit : elle a besoin
  // de l'instance, pas d'une référence qui ne déclenche aucun rendu.
  const [moteurPret, setMoteurPret] = useState<MoteurCarte | null>(null);

  useEffect(() => {
    if (!conteneur.current) return;
    const instance = new MoteurCarte(conteneur.current, monde);
    instance.onSurvol = setSurvol;
    moteur.current = instance;
    setMoteurPret(instance);
    if (import.meta.env.DEV) (window as unknown as { moteurCarte?: MoteurCarte }).moteurCarte = instance;

    const observateur = new ResizeObserver(() => instance.redimensionner());
    observateur.observe(conteneur.current);

    // Décor de zoom uniquement : le plateau n'attend pas ces 500 Ko, et leur échec est muet.
    let abandonne = false;
    chargerRegions()
      .then((donnees) => {
        if (!abandonne) instance.afficherRegions(donnees);
      })
      .catch(() => {});

    return () => {
      abandonne = true;
      observateur.disconnect();
      instance.detruire();
      moteur.current = null;
      setMoteurPret(null);
    };
  }, [monde]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSelection = onSelection;
  }, [onSelection]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSurvolRegion = onSurvolRegion ?? (() => {});
  }, [onSurvolRegion]);

  useEffect(() => {
    if (moteur.current) moteur.current.onSurvolArc = onSurvolArc ?? (() => {});
  }, [onSurvolArc]);

  // Une seule rose à la fois, et la caméra s'immobilise tant qu'elle est ouverte : viser une
  // action sur une carte qui dérive sous le pointeur, c'est viser deux fois.
  const ouvrirRose = useCallback(
    (cible: CibleRose, clientX: number, clientY: number) => {
      const dessinee = roseDe(cible);
      const cadre = conteneur.current?.getBoundingClientRect();
      if (dessinee === null || cadre === undefined) return;
      const marge = (MARGE_ROSE * lireEchelleHud()) / 100;
      setRose({
        rose: dessinee,
        x: borner(clientX - cadre.left, marge, cadre.width),
        y: borner(clientY - cadre.top, marge, cadre.height),
        largeur: cadre.width,
        hauteur: cadre.height,
      });
    },
    [roseDe],
  );

  const fermerRose = useCallback(() => setRose(null), []);

  useEffect(() => {
    if (!moteurPret) return;
    moteurPret.onClicDroit = ({ pays, clientX, clientY }) => {
      if (pays === null) {
        setRose(null);
        return;
      }
      ouvrirRose({ genre: 'pays', pays }, clientX, clientY);
    };
    return () => {
      moteurPret.onClicDroit = () => {};
    };
  }, [moteurPret, ouvrirRose]);

  // Le rappel se déclenche au premier glisser d'orientation, jamais à l'arrivée : montré à
  // l'ouverture du plateau, il répondrait à une question que le joueur ne s'est pas encore posée.
  useEffect(() => {
    if (!moteurPret) return;
    moteurPret.onOrientationAmorcee = () => {
      if (rappelGestesVu()) return;
      graverRappelGestesVu();
      setRappelGestes(true);
    };
    return () => {
      moteurPret.onOrientationAmorcee = () => {};
    };
  }, [moteurPret]);

  useEffect(() => {
    if (!rappelGestes) return;
    const minuteur = setTimeout(() => setRappelGestes(false), DUREE_RAPPEL_MS);
    return () => clearTimeout(minuteur);
  }, [rappelGestes]);

  const surMenuEtiquette = useCallback(
    (etiquette: EtiquetteCarte, clientX: number, clientY: number) => {
      const pays = moteur.current?.paysAuPoint(clientX, clientY) ?? null;
      const cible = cibleDEtiquette(etiquette, pays);
      if (cible === null) return;
      ouvrirRose(cible, clientX, clientY);
    },
    [ouvrirRose],
  );

  useEffect(() => {
    moteurPret?.figerOrbite(rose !== null);
  }, [moteurPret, rose]);

  useEffect(() => {
    moteur.current?.definirNationJoueur(nationJoueur);
  }, [nationJoueur]);

  useEffect(() => {
    moteur.current?.accentuerArc(mouvementAccentue);
  }, [mouvementAccentue]);

  // L'échelle segmentée suit le même pont de surlignage que l'accent du fil : la frise et la
  // carte désignent le même mouvement, il n'y a qu'une source à lire.
  const arcDesigne = arcs.find((arc) => arc.id === mouvementAccentue) ?? null;

  useEffect(() => {
    moteur.current?.afficherArcs(arcs);
  }, [arcs]);

  useEffect(() => {
    moteur.current?.colorerNations(encreParPays);
  }, [encreParPays]);

  useEffect(() => {
    moteur.current?.selectionner(paysSelectionne);
  }, [paysSelectionne]);

  return (
    <div ref={conteneur} className="relative h-full w-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse 75% 68% at 50% 44%, rgba(228,216,189,.045) 0%, transparent 42%), radial-gradient(ellipse 85% 75% at 50% 46%, transparent 48%, rgba(10,7,3,.5) 100%)',
        }}
      />
      <EtiquettesCarte
        etiquettes={etiquettes}
        moteur={moteurPret}
        onSurvolMouvement={onSurvolEtiquette ?? (() => {})}
        onSelection={onSelection}
        onMenuContextuel={surMenuEtiquette}
      />
      <IndicateursBord etiquettes={etiquettes} moteur={moteurPret} bascules={indicateurs} />
      {arcDesigne && (
        <div className="absolute top-4 left-4 z-10">
          <EchelleTrajet arc={arcDesigne} />
        </div>
      )}
      {survol && <EtiquettePays survol={survol} />}
      {rappelGestes && <RappelGestes />}
      <CarteDesCommandes />
      {rose && (
        <RoseDesVents
          rose={rose.rose}
          x={rose.x}
          y={rose.y}
          largeur={rose.largeur}
          hauteur={rose.hauteur}
          onFermer={fermerRose}
          onAction={(action) => {
            fermerRose();
            onActionRose(action);
          }}
        />
      )}
    </div>
  );
}

type RoseOuverte = { rose: Rose; x: number; y: number; largeur: number; hauteur: number };

/**
 * L'encombrement du menu autour de son centre. Il s'ouvre sur le point cliqué, sauf au ras
 * d'un bord : un médaillon qui tomberait hors du plateau serait une action qu'on voit sans
 * pouvoir la prendre. La marge suit l'échelle du HUD, qui zoome le menu entier.
 */
const MARGE_ROSE = 70;

/** Assez pour lire la phrase deux fois, trop court pour qu'elle devienne un meuble. */
const DUREE_RAPPEL_MS = 7000;

/**
 * Le rappel de la première fois. Il ne demande rien et ne se referme pas à la main : il a fait
 * son travail au moment où on l'a lu, et le panneau des commandes prend le relais ensuite.
 */
function RappelGestes() {
  return (
    <div
      className="hud pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 border border-[var(--ink-quiet)] bg-[var(--desk)] px-[14px] py-[7px] font-[var(--font-body)] text-[12px] whitespace-nowrap text-[var(--paper)]"
    >
      clic gauche : orienter <span className="text-[var(--paper-dim)]">·</span> molette ou espace :
      déplacer
    </div>
  );
}

const borner = (valeur: number, marge: number, etendue: number): number =>
  etendue < marge * 2 ? etendue / 2 : Math.min(Math.max(valeur, marge), etendue - marge);

/**
 * Une étiquette de marqueur désigne l'entité qu'elle porte ; toute autre — chantier, tête de
 * mouvement — retombe sur la terre visée en dessous, qui est la seule cible que le jeu sache
 * honorer aujourd'hui.
 */
function cibleDEtiquette(etiquette: EtiquetteCarte, pays: string | null): CibleRose | null {
  if (etiquette.type === 'avant-poste' && etiquette.paysHote !== null) {
    return {
      genre: 'avantPoste',
      id: etiquette.id,
      paysHote: etiquette.paysHote,
      nom: texteDeLigne(etiquette, 'nature') ?? 'avant-poste',
    };
  }
  if (etiquette.type === 'pile') {
    return {
      genre: 'force',
      id: etiquette.id,
      pays,
      nom: texteDeLigne(etiquette, 'chiffres') ?? 'force',
      effectif: Number(texteDeLigne(etiquette, 'effectif') ?? 0),
    };
  }
  return pays === null ? null : { genre: 'pays', pays };
}

function texteDeLigne(
  etiquette: EtiquetteCarte,
  role: 'nature' | 'effectif' | 'chiffres',
): string | null {
  const ligne = etiquette.lignes.find((candidate) => candidate.role === role);
  return ligne === undefined || ligne.role === 'compte' ? null : ligne.texte;
}

function EtiquettePays({ survol }: { survol: NonNullable<SurvolCarte> }) {
  return (
    <div
      className="hud pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[160%] border border-[var(--ink-quiet)] bg-[var(--desk)] px-2 py-[3px] font-[var(--font-body)] text-[11.5px] text-[var(--paper)] whitespace-nowrap"
      style={{ left: survol.ecranX, top: survol.ecranY }}
    >
      {survol.nom}
    </div>
  );
}
