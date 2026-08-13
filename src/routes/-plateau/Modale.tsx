import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PointerEvent as PointerEventReact,
  type ReactNode,
} from 'react';
import { garderGeometrieModale, lireGeometrieModale } from '@/donnees/reglages';

type Poignee = (evenement: PointerEventReact<HTMLElement>) => void;

const ContextePoignee = createContext<Poignee>(() => {});

const LARGEUR_MINIMALE = 320;
const HAUTEUR_MINIMALE = 200;
const PLAN_DE_BASE = 40;

/**
 * Ce que le plateau confie à chaque fenêtre : plusieurs sont ouvertes en même temps, et
 * seule la route sait laquelle est devant.
 */
export type ProprietesFenetre = {
  onFermer: () => void;
  rang: number;
  auPremierPlan: boolean;
  surMiseEnAvant: () => void;
};

/**
 * L'en-tête d'une modale s'enveloppe dedans : c'est la seule zone par laquelle on la déplace.
 * Le déplacement vit dans `Modale` et non chez l'appelant, sinon chaque modale
 * réinventerait sa propre saisie et elles dériveraient les unes des autres.
 */
export function PoigneeModale({ className = '', children }: { className?: string; children: ReactNode }) {
  const saisir = useContext(ContextePoignee);
  return (
    <div onPointerDown={saisir} className={`cursor-move ${className}`}>
      {children}
    </div>
  );
}

export function Modale({
  nom,
  onFermer,
  rang,
  auPremierPlan,
  surMiseEnAvant,
  alignement = 'centre',
  largeur,
  children,
}: ProprietesFenetre & {
  nom: string;
  alignement?: 'haut' | 'centre';
  largeur: number;
  children: ReactNode;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [geometrie, setGeometrie] = useState(() => lireGeometrieModale(nom));
  const { decalage, taille } = geometrie;

  const saisir = useCallback<Poignee>(
    (evenement) => {
      if (evenement.button !== 0) return;
      // Un clic sur un bouton d'en-tête (fermer, onglet) reste un clic, jamais un glissé.
      if ((evenement.target as HTMLElement).closest('button, a, input, select, textarea')) return;
      evenement.preventDefault();
      const echelle = echelleDe(conteneur.current);
      const departX = evenement.clientX - decalage.x * echelle;
      const departY = evenement.clientY - decalage.y * echelle;
      let derniere = decalage;
      suivreLeGlisse(
        (glisse) => {
          derniere = {
            x: (glisse.clientX - departX) / echelle,
            y: (glisse.clientY - departY) / echelle,
          };
          setGeometrie((precedente) => ({ ...precedente, decalage: derniere }));
        },
        () => garderGeometrieModale(nom, { decalage: derniere, taille }),
      );
    },
    [decalage, taille, nom],
  );

  const redimensionner = useCallback<Poignee>(
    (evenement) => {
      if (evenement.button !== 0) return;
      evenement.preventDefault();
      const boite = conteneur.current;
      if (!boite) return;
      const echelle = echelleDe(boite);
      const departX = evenement.clientX;
      const departY = evenement.clientY;
      const largeurDepart = boite.offsetWidth;
      const hauteurDepart = boite.offsetHeight;
      let derniere = taille;
      suivreLeGlisse(
        (glisse) => {
          derniere = {
            largeur: Math.max(LARGEUR_MINIMALE, largeurDepart + (glisse.clientX - departX) / echelle),
            hauteur: Math.max(HAUTEUR_MINIMALE, hauteurDepart + (glisse.clientY - departY) / echelle),
          };
          setGeometrie((precedente) => ({ ...precedente, taille: derniere }));
        },
        () => garderGeometrieModale(nom, { decalage, taille: derniere }),
      );
    },
    [decalage, taille, nom],
  );

  // Le focus se prend à l'ouverture seulement : le reprendre à chaque mise en avant
  // l'arracherait au champ sur lequel le joueur vient de cliquer.
  useEffect(() => {
    conteneur.current?.focus();
  }, []);

  useEffect(() => {
    // Échap ne ferme que la fenêtre du dessus, mais pas de piège à Tab : une fenêtre posée
    // sur le bureau n'est pas exclusive, le focus doit pouvoir repartir vers la carte.
    if (!auPremierPlan) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') onFermer();
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onFermer, auPremierPlan]);

  // Une fenêtre, pas une modale : aucun voile, la carte reste vivante derrière.
  // Le conteneur ne sert qu'au placement et laisse passer les clics.
  return (
    <div
      className={`pointer-events-none fixed inset-0 flex justify-center ${
        alignement === 'haut' ? 'items-start px-6 py-[34px]' : 'items-center p-8'
      }`}
      style={{ zIndex: PLAN_DE_BASE + rang }}
    >
      <div
        ref={conteneur}
        tabIndex={-1}
        role="dialog"
        onPointerDown={auPremierPlan ? undefined : surMiseEnAvant}
        className="hud @container pointer-events-auto relative flex max-h-full shrink-0 flex-col outline-none"
        style={{
          transform: `translate(${decalage.x}px, ${decalage.y}px)`,
          width: taille ? taille.largeur : `min(${largeur}px, 100%)`,
          ...(taille ? { height: taille.hauteur } : {}),
        }}
      >
        <ContextePoignee.Provider value={saisir}>{children}</ContextePoignee.Provider>
        <div
          aria-hidden
          onPointerDown={redimensionner}
          title="redimensionner"
          className="absolute right-0 bottom-0 z-10 h-[16px] w-[16px] cursor-nwse-resize"
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg, transparent 0 3px, var(--ink) 3px 4px)',
          }}
        />
      </div>
    </div>
  );
}

function suivreLeGlisse(surGlisse: (glisse: PointerEvent) => void, surRelache: () => void) {
  const relacher = () => {
    window.removeEventListener('pointermove', surGlisse);
    window.removeEventListener('pointerup', relacher);
    surRelache();
  };
  window.addEventListener('pointermove', surGlisse);
  window.addEventListener('pointerup', relacher);
}

/**
 * `.hud` porte un `zoom`, et le pointeur se mesure en pixels d'écran alors que la largeur
 * s'écrit en pixels de mise en page : sans ce rapport, tout glissé dérive dès que le joueur
 * a changé l'échelle de l'interface.
 */
function echelleDe(element: HTMLElement | null): number {
  if (!element || element.offsetWidth === 0) return 1;
  return element.getBoundingClientRect().width / element.offsetWidth;
}
