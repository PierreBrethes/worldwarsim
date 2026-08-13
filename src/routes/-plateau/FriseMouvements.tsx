import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useHorloge } from '@/coque/horloge';
import { enHeureLocale, enHeuresMinutesSecondes } from '@/domaine/duree';
import {
  compteursFrise,
  construireFrise,
  estImmobilise,
  filtrerFrise,
  millisecondesAvantResolution,
  partParcourue,
  type FicheMouvement,
  type FiltreFrise,
} from '@/domaine/frise';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { SpriteUnite } from '@/emblemes/SpriteUnite';
import { urlSprite } from '@/emblemes/unites/manifeste';
import { garderFriseRepliee, lireFriseRepliee } from '@/donnees/reglages';

const LARGEUR_FICHE = 296;
const ECART_FICHES = 24;
const PAS = LARGEUR_FICHE + ECART_FICHES;

/**
 * La frise reste imprimée sur le plateau — pas de cadre, des filets et de l'encre, trois
 * encres et trois seulement : la mienne, le critique d'un cap qui vient sur moi, le gris
 * sourd de ce qui se trame ailleurs. Mais la carte passe sous elle, et une encre claire sur
 * un littoral clair ne se lit plus : d'où le fondu vers le bureau, assez haut pour porter la
 * fiche entière, sans arête qui trahirait un panneau posé dessus.
 */
export function FriseMouvements({
  vue,
  mouvementSurvole,
  mouvementDesigneParLaCarte,
  onSurvol,
  onSelection,
}: {
  vue: VueJoueur;
  mouvementSurvole: string | null;
  /** Seule la carte a le droit de déplacer la piste : un survol de fiche ne la fait pas fuir. */
  mouvementDesigneParLaCarte: string | null;
  onSurvol: (id: string | null) => void;
  onSelection: (nom: string | null) => void;
}) {
  const maintenant = useHorloge();
  const fiches = useMemo(() => construireFrise(vue), [vue]);
  const [repliee, setRepliee] = useState(lireFriseRepliee);
  const [filtre, setFiltre] = useState<FiltreFrise>('tous');
  const piste = useRef<HTMLDivElement>(null);
  const [course, setCourse] = useState({ gauche: 0, fenetre: 0, longueur: 0 });

  const retenues = useMemo(() => filtrerFrise(fiches, filtre), [fiches, filtre]);

  useEffect(() => {
    garderFriseRepliee(repliee);
  }, [repliee]);

  const mesurer = useCallback(() => {
    const noeud = piste.current;
    if (!noeud) return;
    setCourse({
      gauche: noeud.scrollLeft,
      fenetre: noeud.clientWidth,
      longueur: noeud.scrollWidth,
    });
  }, []);

  useEffect(() => {
    const noeud = piste.current;
    if (!noeud) return;
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(noeud);
    return () => observateur.disconnect();
  }, [mesurer, repliee, retenues.length]);

  // Surligner une fiche restée hors fenêtre ne surlignerait rien : le survol venu de la carte
  // amène donc la piste sur elle, du plus court déplacement possible.
  useEffect(() => {
    const noeud = piste.current;
    if (!noeud || !mouvementDesigneParLaCarte) return;
    const rang = retenues.findIndex((fiche) => fiche.id === mouvementDesigneParLaCarte);
    if (rang < 0) return;
    const bordGauche = rang * PAS;
    const bordDroit = bordGauche + LARGEUR_FICHE;
    if (bordGauche < noeud.scrollLeft) {
      noeud.scrollTo({ left: bordGauche, behavior: 'smooth' });
    } else if (bordDroit > noeud.scrollLeft + noeud.clientWidth) {
      noeud.scrollTo({ left: bordDroit - noeud.clientWidth, behavior: 'smooth' });
    }
  }, [mouvementDesigneParLaCarte, retenues]);

  // Ciel vide, la frise ne disparaît pas : c'est là qu'on lit les slots, et « aucun mouvement,
  // deux slots libres » est justement l'état où on a besoin de le savoir.
  const vide = fiches.length === 0;
  const deployee = !repliee && !vide;

  const glisser = (pas: number) =>
    piste.current?.scrollBy({ left: pas * PAS, behavior: 'smooth' });

  const resteAvant = course.gauche > 1;
  const resteApres = course.gauche + course.fenetre < course.longueur - 1;

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-4 ${
        deployee ? 'pt-16' : 'pt-6'
      }`}
      style={{
        background: deployee
          ? 'linear-gradient(to top, rgba(15,10,4,.94) 0%, rgba(15,10,4,.88) 62%, rgba(15,10,4,.55) 84%, rgba(15,10,4,0) 100%)'
          : 'linear-gradient(to top, rgba(15,10,4,.9) 0%, rgba(15,10,4,.72) 55%, rgba(15,10,4,0) 100%)',
      }}
    >
      <div className="flex items-end gap-6 border-b border-[rgba(228,216,189,.18)] pb-2">
        <button
          type="button"
          disabled={vide}
          onClick={() => setRepliee(!repliee)}
          title={vide ? undefined : repliee ? 'déplier la frise' : 'replier la frise'}
          className="pointer-events-auto flex shrink-0 items-baseline gap-3 bg-transparent enabled:cursor-pointer"
        >
          <span className="font-[var(--font-display)] text-[12px] font-semibold tracking-[.24em] text-[rgba(228,216,189,.58)] uppercase">
            mouvements en vol
          </span>
          <span className="font-[var(--font-mono)] text-[15px] text-[var(--paper)]">
            {fiches.length}
          </span>
          {!vide && (
            <span className="text-[10px] text-[rgba(228,216,189,.34)]">{repliee ? '▲' : '▼'}</span>
          )}
        </button>

        {/* Les slots comptent ce qu'on peut encore lancer : leur place est contre le nombre
            de mouvements en vol, pas dans un bandeau qu'on ne lit pas en envoyant. */}
        <span
          title="slots de mouvement occupés"
          className="flex shrink-0 items-baseline gap-3"
        >
          <span className="font-[var(--font-display)] text-[12px] font-semibold tracking-[.24em] text-[rgba(228,216,189,.58)] uppercase">
            slots
          </span>
          <span className="font-[var(--font-mono)] text-[15px] text-[var(--paper)]">
            {vue.moi.slots.utilises} / {vue.moi.slots.total}
          </span>
        </span>

        {vide ? (
          <span className="flex-1 text-[11px] tracking-[.14em] text-[rgba(228,216,189,.3)] uppercase">
            rien en vol
          </span>
        ) : (
          <>
            <RangeeCompteurs
              fiches={fiches}
              filtre={filtre}
              onFiltre={(demande) => {
                setFiltre(demande);
                // Filtrer une piste repliée ne montrerait rien : la demande vaut dépliage.
                setRepliee(false);
                piste.current?.scrollTo({ left: 0 });
              }}
            />
            <ProchaineArrivee fiches={fiches} maintenant={maintenant} />
          </>
        )}
      </div>

      {deployee && (
        <div className="relative mt-3">
          <Piste noeud={piste} onCourse={mesurer}>
            {retenues.map((fiche) => (
              <Fiche
                key={fiche.id}
                fiche={fiche}
                vue={vue}
                maintenant={maintenant}
                designee={fiche.id === mouvementSurvole}
                onSurvol={onSurvol}
                onSelection={onSelection}
              />
            ))}
          </Piste>
          <Gouverne bord="gauche" visible={resteAvant} onGlisser={() => glisser(-1)} />
          <Gouverne bord="droite" visible={resteApres} onGlisser={() => glisser(1)} />
        </div>
      )}
    </div>
  );
}

function RangeeCompteurs({
  fiches,
  filtre,
  onFiltre,
}: {
  fiches: ReadonlyArray<FicheMouvement>;
  filtre: FiltreFrise;
  onFiltre: (filtre: FiltreFrise) => void;
}) {
  return (
    <div className="pointer-events-auto flex flex-1 flex-wrap items-end gap-2">
      {compteursFrise(fiches).map((compteur) => {
        const actif = compteur.cle === filtre;
        const encre = compteur.alerte ? 'var(--critique)' : 'rgba(228,216,189,.5)';
        return (
          <button
            key={compteur.cle}
            type="button"
            onClick={() => onFiltre(actif ? 'tous' : compteur.cle)}
            className="flex cursor-pointer items-baseline gap-[7px] border px-[10px] pt-[5px] pb-[6px]"
            style={{
              background: actif ? 'rgba(228,216,189,.09)' : 'transparent',
              borderColor: actif
                ? 'rgba(228,216,189,.45)'
                : compteur.alerte
                  ? 'rgba(157,70,56,.55)'
                  : 'rgba(228,216,189,.18)',
              color: actif ? 'var(--paper)' : encre,
            }}
          >
            <span className="text-[9.5px] tracking-[.18em] uppercase">{compteur.libelle}</span>
            <span className="font-[var(--font-mono)] text-[13px] font-semibold">
              {compteur.nombre}
            </span>
            {compteur.alerte && (
              <span className="font-[var(--font-display)] text-[14px] leading-none font-extrabold">
                !
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * La frise est triée par arrivée : la prochaine échéance est toujours la première fiche.
 * Elle est répétée en bout de rangée parce que c'est la seule chose qu'on relit sans lire.
 */
function ProchaineArrivee({
  fiches,
  maintenant,
}: {
  fiches: ReadonlyArray<FicheMouvement>;
  maintenant: number;
}) {
  const prochaine = fiches.find((fiche) => fiche.chronologie.connue);
  if (!prochaine) return null;
  const restant = millisecondesAvantResolution(prochaine.chronologie, maintenant) ?? 0;
  const immobilise = estImmobilise(prochaine.chronologie);
  return (
    <div className="flex shrink-0 items-baseline gap-[10px] font-[var(--font-mono)] text-[10.5px] tracking-[.1em] text-[rgba(228,216,189,.34)]">
      <span className="uppercase">proch. arrivée</span>
      <span
        className="text-[14px] tracking-normal"
        style={{ color: immobilise ? 'var(--notable)' : 'var(--ravitaillement)' }}
      >
        {immobilise ? '⏸ ' : ''}
        {prochaine.estime ? '~' : ''}
        {enHeuresMinutesSecondes(restant)}
      </span>
    </div>
  );
}

/**
 * On saisit la frise et on la tire, comme la planche de dépêches qu'elle imite : pas de crans,
 * pas de zone qui défile sous le pointeur immobile. Le glissé est un vrai défilement natif —
 * la roulette et le trackpad marchent sans que rien ne le programme.
 */
const Piste = ({
  noeud,
  children,
  onCourse,
}: {
  noeud: RefObject<HTMLDivElement>;
  children: ReactNode;
  onCourse: () => void;
}) => {
  const empoignade = useRef<{ pointeur: number; depart: number; gauche: number } | null>(null);
  const aGlisse = useRef(false);

  return (
    <div
      ref={noeud}
      onScroll={onCourse}
      // Un glissé de 4 px reste un clic : sans ce seuil, ouvrir une fiche deviendrait un pari.
      onPointerDown={(pointeur) => {
        if (pointeur.button !== 0) return;
        const noeud = pointeur.currentTarget;
        noeud.setPointerCapture(pointeur.pointerId);
        empoignade.current = {
          pointeur: pointeur.pointerId,
          depart: pointeur.clientX,
          gauche: noeud.scrollLeft,
        };
        aGlisse.current = false;
      }}
      onPointerMove={(pointeur) => {
        const prise = empoignade.current;
        if (!prise || prise.pointeur !== pointeur.pointerId) return;
        const course = pointeur.clientX - prise.depart;
        if (Math.abs(course) > 4) aGlisse.current = true;
        pointeur.currentTarget.scrollLeft = prise.gauche - course;
      }}
      onPointerUp={(pointeur) => {
        if (empoignade.current?.pointeur === pointeur.pointerId) empoignade.current = null;
        pointeur.currentTarget.releasePointerCapture(pointeur.pointerId);
      }}
      onPointerCancel={() => {
        empoignade.current = null;
      }}
      onClickCapture={(clic) => {
        if (!aGlisse.current) return;
        clic.preventDefault();
        clic.stopPropagation();
      }}
      onWheel={(roulette) => {
        if (roulette.deltaX !== 0) return;
        roulette.currentTarget.scrollLeft += roulette.deltaY;
      }}
      className="pointer-events-auto flex cursor-grab overflow-x-auto overscroll-x-contain select-none active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ gap: ECART_FICHES }}
    >
      {children}
    </div>
  );
};

/** Une flèche ne s'affiche que s'il reste de la matière de son côté — sinon elle ment. */
function Gouverne({
  bord,
  visible,
  onGlisser,
}: {
  bord: 'gauche' | 'droite';
  visible: boolean;
  onGlisser: () => void;
}) {
  return (
    <button
      type="button"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={onGlisser}
      title={bord === 'gauche' ? 'fiches précédentes' : 'fiches suivantes'}
      className={`absolute top-1/2 z-10 h-[30px] w-[24px] -translate-y-1/2 cursor-pointer border border-[rgba(228,216,189,.28)] text-[10px] leading-none text-[rgba(228,216,189,.6)] transition-opacity duration-200 ${
        bord === 'gauche' ? '-left-[6px]' : '-right-[6px]'
      } ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      style={{ background: 'rgba(15,10,4,.9)' }}
    >
      {bord === 'gauche' ? '◀' : '▶'}
    </button>
  );
}

/**
 * Le galbe de l'arc miniature reprend celui des arcs de la carte : une quadratique qui
 * décolle et retombe. C'est le même geste à deux échelles, et c'est ce qui fait lire la
 * fiche comme un extrait du plateau plutôt que comme un graphique.
 */
const DEPART = { x: 4, y: 38 };
const SOMMET = { x: 130, y: -4 };
const ARRIVEE = { x: 256, y: 38 };
const LARGEUR_TRACE = 260;
const HAUTEUR_TRACE = 46;
const COURBE = `M${DEPART.x} ${DEPART.y} Q${SOMMET.x} ${SOMMET.y} ${ARRIVEE.x} ${ARRIVEE.y}`;
const HAUTEUR_SPRITE = 17;

const pointSurCourbe = (part: number) => ({
  x: (1 - part) ** 2 * DEPART.x + 2 * part * (1 - part) * SOMMET.x + part ** 2 * ARRIVEE.x,
  y: (1 - part) ** 2 * DEPART.y + 2 * part * (1 - part) * SOMMET.y + part ** 2 * ARRIVEE.y,
});

function Fiche({
  fiche,
  vue,
  maintenant,
  designee,
  onSurvol,
  onSelection,
}: {
  fiche: FicheMouvement;
  vue: VueJoueur;
  maintenant: number;
  designee: boolean;
  onSurvol: (id: string | null) => void;
  onSelection: (nom: string | null) => void;
}) {
  const mien = fiche.famille === 'mien';
  const encre = encreDeFiche(fiche, vue);
  const part = partParcourue(fiche.chronologie, maintenant);
  const restant = millisecondesAvantResolution(fiche.chronologie, maintenant);
  const immobilise = estImmobilise(fiche.chronologie);
  const marqueur = pointSurCourbe(part);

  return (
    <div
      role={mien ? 'button' : undefined}
      tabIndex={mien ? 0 : undefined}
      onMouseEnter={() => onSurvol(fiche.id)}
      onMouseLeave={() => onSurvol(null)}
      onFocus={() => onSurvol(fiche.id)}
      onBlur={() => onSurvol(null)}
      onClick={mien ? () => onSelection(destinationCarte(fiche, vue)) : undefined}
      onKeyDown={
        mien
          ? (touche) => touche.key === 'Enter' && onSelection(destinationCarte(fiche, vue))
          : undefined
      }
      className="shrink-0 border-t pt-2"
      style={{
        width: LARGEUR_FICHE,
        borderTopColor: designee ? 'rgba(228,216,189,.55)' : 'rgba(228,216,189,.16)',
        opacity: designee ? 1 : 0.82,
        cursor: mien ? 'pointer' : 'default',
      }}
    >
      <div className="flex items-baseline justify-between gap-2 text-[12px] tracking-[.04em]">
        <span
          className="truncate"
          style={
            mien
              ? { color: 'rgba(228,216,189,.46)' }
              : { fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'rgba(228,216,189,.3)' }
          }
        >
          {fiche.origine}
        </span>
        <span
          className="shrink-0 truncate"
          style={{
            fontFamily: mien ? undefined : 'var(--font-mono)',
            fontSize: mien ? '13.5px' : '12.5px',
            color: designee ? 'var(--paper)' : 'rgba(228,216,189,.72)',
          }}
        >
          {fiche.destination}
        </span>
      </div>

      <div className="relative" style={{ height: HAUTEUR_TRACE }}>
        <svg
          width={LARGEUR_FICHE}
          height={HAUTEUR_TRACE}
          viewBox={`0 0 ${LARGEUR_TRACE} ${HAUTEUR_TRACE}`}
          preserveAspectRatio="none"
          className="block overflow-visible"
          aria-hidden
        >
          <path
            d={COURBE}
            fill="none"
            stroke="rgba(228,216,189,.19)"
            strokeWidth={mien ? 1.2 : 1}
            strokeDasharray={mien ? undefined : '2 5'}
          />
          {mien && (
            <>
              <path
                d={COURBE}
                fill="none"
                stroke={encre}
                strokeWidth={1.2}
                pathLength={100}
                strokeDasharray={`${(part * 100).toFixed(1)} 100`}
              />
              <circle cx={DEPART.x} cy={DEPART.y} r={2} fill="none" stroke={encre} />
            </>
          )}
          <path d="M250 32 256 38 248 41 Z" fill={mien ? encre : 'rgba(228,216,189,.3)'} />
          {/* Une position adverse est une zone, jamais un point : le cadre pointillé est
              exactement ce que le renseignement sait dire, et il le dit à l'échelle. */}
          {!mien && (
            <rect
              x={marqueur.x - 18}
              y={9}
              width={36}
              height={16}
              fill="none"
              stroke={encre}
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
          )}
        </svg>
        <span
          className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center"
          style={{ left: `${(marqueur.x / LARGEUR_TRACE) * 100}%`, top: marqueur.y }}
        >
          {/* Le repli en cadre pointillé de `SpriteUnite` est dessiné pour le papier : sur le
              bureau il disparaît. Sans planche, la frise reprend donc le losange anonyme —
              le même aveu que le cône de la carte. */}
          {fiche.role && urlSprite(vue.moi.nation, fiche.role, 1) !== null ? (
            <SpriteUnite nation={vue.moi.nation} role={fiche.role} hauteur={HAUTEUR_SPRITE} />
          ) : (
            <span className="block h-[8px] w-[8px] rotate-45" style={{ background: encre }} />
          )}
        </span>
      </div>

      <div className="mt-[3px] flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[9.5px] tracking-[.2em] uppercase"
          style={{ color: mien ? 'rgba(228,216,189,.48)' : encre, fontWeight: mien ? undefined : 600 }}
        >
          {fiche.libelleType}
          {fiche.identifie && (
            <span className="ml-2 text-[rgba(228,216,189,.42)]">· identifié</span>
          )}
        </span>
        <span
          className="shrink-0 font-[var(--font-mono)] text-[15px]"
          style={{ color: immobilise ? 'var(--notable)' : mien ? 'var(--paper)' : encre }}
        >
          {restant === null ? '—' : `${fiche.estime ? '~' : ''}${enHeuresMinutesSecondes(restant)}`}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[11.5px]"
          style={
            fiche.identifie || mien
              ? { color: 'rgba(228,216,189,.4)' }
              : {
                  fontFamily: 'var(--font-display)',
                  fontStyle: 'italic',
                  color: 'rgba(228,216,189,.3)',
                }
          }
        >
          {fiche.composition}
        </span>
        <Horaire fiche={fiche} immobilise={immobilise} />
      </div>
    </div>
  );
}

/**
 * Un mouvement bloqué à la frontière n'a plus d'heure d'arrivée qui veuille dire quelque
 * chose : ce qui compte est l'heure à laquelle il sera résolu, et la marque dit pourquoi
 * elle est plus tardive que le trajet.
 */
function Horaire({ fiche, immobilise }: { fiche: FicheMouvement; immobilise: boolean }) {
  if (!fiche.chronologie.connue) {
    return (
      <span className="shrink-0 font-[var(--font-mono)] text-[10.5px] text-[rgba(228,216,189,.28)]">
        heure inconnue
      </span>
    );
  }
  return (
    <span
      className="shrink-0 font-[var(--font-mono)] text-[10.5px] tracking-[.06em]"
      style={{ color: immobilise ? 'var(--notable)' : 'rgba(228,216,189,.34)' }}
      title={immobilise ? 'immobilisé à la frontière : plage de repos de la cible' : 'heure d’arrivée'}
    >
      {immobilise ? '⏸ ' : '→ '}
      {fiche.estime ? '~' : ''}
      {enHeureLocale(fiche.chronologie.resolutionA)}
    </span>
  );
}

const encreDeFiche = (fiche: FicheMouvement, vue: VueJoueur): string => {
  if (fiche.famille === 'mien') return vue.moi.encre;
  return fiche.famille === 'capSurMoi' ? 'var(--critique)' : 'var(--routine)';
};

/**
 * La fiche imprime le nom français ; la carte, elle, ne connaît que les libellés anglais de
 * `monde.json` — c'est l'arc qui porte les deux, la frise ne re-traduit rien.
 */
const destinationCarte = (fiche: FicheMouvement, vue: VueJoueur): string | null => {
  const arc = vue.arcs.find((candidat) => candidat.id === fiche.id);
  return arc?.etat === 'mien' ? arc.destinationNom : null;
};
