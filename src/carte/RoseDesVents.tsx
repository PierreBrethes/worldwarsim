import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ActionRose, PictoRose, Rose } from '@/domaine/rose-des-vents';

/**
 * Le menu radial du plateau, ouvert au clic droit sur le point visé. Il vit dans la couche
 * HTML au-dessus du canevas, comme les étiquettes, et n'est opaque au pointeur que sur ses
 * médaillons — la carte reste vivante autour.
 *
 * Les pictos restent **muets** : libellé, coût et conséquence n'apparaissent qu'au survol,
 * dans l'infobulle. C'est ce qui autorise l'éventail à rester dense sans devenir bavard.
 *
 * Les classes sont posées ici et stylées dans `src/styles/rose-des-vents.css`.
 */
export function RoseDesVents({
  rose,
  x,
  y,
  largeur,
  hauteur,
  onFermer,
  onAction,
}: {
  rose: Rose;
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  onFermer: () => void;
  onAction: (action: ActionRose) => void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const bulle = useRef<HTMLDivElement>(null);
  const [survole, setSurvole] = useState(-1);
  const [hauteurBulle, setHauteurBulle] = useState(HAUTEUR_BULLE);

  useEffect(() => {
    const surPointeur = (evenement: PointerEvent) => {
      if (racine.current?.contains(evenement.target as Node)) return;
      onFermer();
    };
    // En capture, et l'événement s'arrête là : Échap referme le menu, jamais la fenêtre qui
    // se trouve derrière lui.
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key !== 'Escape') return;
      evenement.stopPropagation();
      onFermer();
    };
    document.addEventListener('pointerdown', surPointeur);
    document.addEventListener('keydown', surTouche, true);
    return () => {
      document.removeEventListener('pointerdown', surPointeur);
      document.removeEventListener('keydown', surTouche, true);
    };
  }, [onFermer]);

  // L'infobulle se cale sur sa propre hauteur, qui dépend de son contenu : on la mesure, puis
  // on repose. Sans cette passe, une bulle courte tombe décentrée de son médaillon.
  useLayoutEffect(() => {
    const mesuree = bulle.current?.offsetHeight;
    if (mesuree !== undefined && Math.abs(mesuree - hauteurBulle) > 0.5) setHauteurBulle(mesuree);
  }, [survole, hauteurBulle]);

  const action = rose.actions[survole] ?? null;
  const placement =
    action === null
      ? null
      : placerBulle(angleDe(survole, rose.actions.length), x, y, largeur, hauteur, hauteurBulle);

  return (
    <div className="rose-des-vents">
      <div
        ref={racine}
        className="rose"
        style={{ left: x, top: y }}
        onContextMenu={(evenement) => evenement.preventDefault()}
      >
        <div className="rose-menu">
          <svg className="rose-trace" viewBox="0 0 240 240" width={CADRE} height={CADRE} aria-hidden>
            {rose.actions.map((_, rang) => {
              const angle = angleDe(rang, rose.actions.length);
              const [x1, y1] = point(11, angle);
              const [x2, y2] = point(RAYON_MEDAILLON - 14, angle);
              return (
                <line
                  key={rang}
                  className="rose-amorce"
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  opacity={survole === rang ? 0.85 : 0.4}
                />
              );
            })}
            <line className="rose-mire" x1="104" y1="120" x2="136" y2="120" />
            <line className="rose-mire" x1="120" y1="104" x2="120" y2="136" />
            <circle className="rose-mire-cercle" cx="120" cy="120" r="8" />
            <circle className="rose-mire-point" cx="120" cy="120" r="2.2" />
          </svg>

          {rose.actions.map((candidate, rang) => {
            const [gauche, haut] = point(RAYON_MEDAILLON, angleDe(rang, rose.actions.length));
            return (
              <button
                key={rang}
                type="button"
                aria-label={candidate.libelle}
                className={`rose-medaillon${survole === rang ? ' rose-medaillon--mouille' : ''}`}
                style={{ left: gauche, top: haut }}
                onPointerEnter={() => setSurvole(rang)}
                onPointerLeave={() => setSurvole((precedent) => (precedent === rang ? -1 : precedent))}
                onFocus={() => setSurvole(rang)}
                onBlur={() => setSurvole((precedent) => (precedent === rang ? -1 : precedent))}
                onClick={() => onAction(candidate)}
              >
                <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden>
                  {TRACE_PICTO[candidate.picto]}
                </svg>
              </button>
            );
          })}

          {action !== null && placement !== null && (
            <>
              <div className="rose-attache" style={placement.attache} />
              <div
                ref={bulle}
                className="rose-bulle"
                style={{ left: placement.x, top: placement.y }}
              >
                <div className="rose-bulle-cadre">
                  <div className="rose-bulle-entete">
                    <span>{rose.kicker}</span>
                    <span className="rose-bulle-rang">
                      {survole + 1} / {rose.actions.length}
                    </span>
                  </div>
                  <div className="rose-bulle-nom">{rose.nom}</div>
                  <div className="rose-bulle-filet" />
                  <div className="rose-bulle-libelle">{action.libelle}</div>
                  {action.cout !== null && <div className="rose-bulle-cout">{action.cout}</div>}
                  <div className="rose-bulle-consequence">{action.consequence}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const CADRE = 240;
const CENTRE = 120;
const RAYON_MEDAILLON = 36;
/** Le rayon auquel l'infobulle s'amarre : le médaillon plus sa marge de respiration. */
const RAYON_AMARRE = 56;
const LARGEUR_BULLE = 214;
const HAUTEUR_BULLE = 170;
const ECART_BULLE = 16;

/** L'éventail part plein nord et tourne dans le sens horaire. */
const angleDe = (rang: number, total: number): number => (rang * 360) / total;

function point(rayon: number, angle: number): readonly [number, number] {
  const radians = (angle * Math.PI) / 180;
  return [CENTRE + rayon * Math.sin(radians), CENTRE - rayon * Math.cos(radians)];
}

const borner = (valeur: number, bas: number, haut: number): number =>
  haut < bas ? (bas + haut) / 2 : Math.min(Math.max(valeur, bas), haut);

/**
 * L'infobulle se pose du côté où le plateau lui laisse la place, jamais à cheval sur le bord :
 * une conséquence coupée en deux ne se lit pas. Les coordonnées sont celles du cadre du menu,
 * d'où le report du décalage entre son centre et le bord de la carte.
 */
function placerBulle(
  angle: number,
  x: number,
  y: number,
  largeur: number,
  hauteur: number,
  hauteurBulle: number,
) {
  const aDroite = x + RAYON_AMARRE + ECART_BULLE + LARGEUR_BULLE + 12 <= largeur;
  const [, ancreY] = point(RAYON_AMARRE, angle);
  const haut = borner(
    ancreY - hauteurBulle / 2,
    8 - (y - CENTRE),
    hauteur - 8 - hauteurBulle - (y - CENTRE),
  );

  return {
    x: aDroite ? CENTRE + RAYON_AMARRE + ECART_BULLE : CENTRE - RAYON_AMARRE - ECART_BULLE - LARGEUR_BULLE,
    y: haut,
    attache: {
      left: aDroite ? CENTRE + RAYON_AMARRE - 2 : CENTRE - RAYON_AMARRE - ECART_BULLE,
      top: borner(ancreY, haut + 10, haut + hauteurBulle - 10),
      width: ECART_BULLE + 4,
    },
  };
}

/**
 * La planche de pictos de la maquette, reprise trait pour trait. Elle est en SVG en ligne et
 * non en masque PNG comme `Picto` : ces six dessins n'existent pas dans `public/pictos/`, et
 * un tracé de vingt unités ne gagne rien à passer par un fichier.
 */
const TRACE_PICTO: Readonly<Record<PictoRose, ReactNode>> = {
  cabane: <path d="M10 1.75 L18.5 8.5 H16.7 V18 H3.3 V8.5 H1.5 Z" />,
  grue: (
    <path d="M2.3 2.5 H18.2 V5.4 H2.3 Z M6.2 5.4 H9.7 V17 H6.2 Z M14.3 5.4 H16.2 V10.2 H14.3 Z M13.2 10.2 H17.3 V13.2 H13.2 Z M3.1 17 H12.8 V19.5 H3.1 Z" />
  ),
  ancre: (
    <path d="M10 1.5 A2.5 2.5 0 1 1 9.99 1.5 Z M8.9 5.6 H11.1 V17.2 H8.9 Z M5.4 7.1 H14.6 V9 H5.4 Z M3.1 10.9 C3.1 15.8 6.2 18.3 10 18.3 C13.8 18.3 16.9 15.8 16.9 10.9 H14.8 C14.8 14.8 12.6 16.2 10 16.2 C7.4 16.2 5.2 14.8 5.2 10.9 Z M3.1 9 L5.9 13 H0.3 Z M16.9 9 L19.7 13 H14.1 Z" />
  ),
  casque: (
    <path d="M4.5 11.9 C4.5 8 6.9 5.2 10 5.2 C13.1 5.2 15.5 8 15.5 11.9 Z M1.3 11.3 C1.3 14.9 5.2 16.1 10 16.1 C14.8 16.1 18.7 14.9 18.7 11.3 Z" />
  ),
  helice: (
    <>
      <path d="M10 1 C12.8 2.9 13.7 5.9 12.8 9.2 H7.2 C6.3 5.9 7.2 2.9 10 1 Z M10 6.8 A3.2 3.2 0 1 1 9.99 6.8 Z" />
      <path
        d="M10 1 C12.8 2.9 13.7 5.9 12.8 9.2 H7.2 C6.3 5.9 7.2 2.9 10 1 Z"
        transform="rotate(120 10 10)"
      />
      <path
        d="M10 1 C12.8 2.9 13.7 5.9 12.8 9.2 H7.2 C6.3 5.9 7.2 2.9 10 1 Z"
        transform="rotate(240 10 10)"
      />
    </>
  ),
  fusils: (
    <>
      <path
        d="M8.7 1.4 H11.3 V10.8 H8.7 Z M8.2 10.4 H12.8 L13.9 18.6 H9.5 Z"
        transform="rotate(-28 10 10)"
      />
      <path
        d="M8.7 1.4 H11.3 V10.8 H8.7 Z M8.2 10.4 H12.8 L13.9 18.6 H9.5 Z"
        transform="rotate(28 10 10)"
      />
    </>
  ),
};
