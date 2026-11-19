import { useLayoutEffect, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import { asDuration, asShortDuration } from '@/domain/duration';
import type { Underway, UnderwayFace } from '@/domain/underway';
import { keepUnderwayFolded, readUnderwayFolded } from '@/data/settings';
import { BuildingPlate } from '@/emblems/Plate';
import { UnitSprite } from '@/emblems/UnitSprite';
import { Pictogram } from '@/shell/IndicatorGlyph';
import { useClock } from '@/shell/clock';
import { crowdedBy } from './underway-room';

/** La hauteur d'un onglet et d'une ligne, et l'écart entre elles : la pile dépliée se calcule. */
const HEAD_PX = 28;
const ROW_PX = 44;
const ROW_GAP_PX = 5;

/**
 * **La pile se replie sur son onglet quand ce qui monte du bas de la carte la recouvrirait**
 * (#587) : les boutons et « Sonder » (`data-poster-floor`) suivent l'étage. Mesuré sur l'écran, à
 * chaque changement d'étage (`--mat-rise` s'écrit sur la racine), de taille ou de lignes.
 */
function useCrowded(section: React.RefObject<HTMLElement | null>, count: number): boolean {
  const [crowded, setCrowded] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      const head = section.current?.firstElementChild;
      if (!head) return;
      const at = head.getBoundingClientRect();
      const scale = at.height / HEAD_PX || 1;
      const pile = {
        left: at.left,
        right: at.left + 174 * scale,
        top: at.top,
        bottom: at.top + (HEAD_PX + count * (ROW_PX + ROW_GAP_PX)) * scale,
      };
      const floors = [...document.querySelectorAll('[data-poster-floor]')].map((node) =>
        node.getBoundingClientRect(),
      );
      setCrowded(crowdedBy(pile, floors));
    };
    measure();
    const watch = new MutationObserver(measure);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    addEventListener('resize', measure);
    return () => {
      watch.disconnect();
      removeEventListener('resize', measure);
    };
  }, [section, count]);
  return crowded;
}

/**
 * **« En cours », sous le bandeau du téléphone** (refonte mobile, 1a et 1d) : les horaires sans
 * rien ouvrir. Une ligne de 44 px par compte à rebours — mouvements, chantier, fondations,
 * recrutements, lots — du plus proche au plus lointain, et un toucher recentre la carte sur ce
 * qu'elle compte. Un toucher sur l'en-tête replie la colonne à ses seules heures.
 *
 * **Ce qui vient de partir s'y voit, même repliée** : la ligne du mouvement qu'on vient
 * d'envoyer reste dépliée et cernée le temps qu'on la lise (`fresh`). Vide, la colonne n'existe
 * pas — comme « à faire maintenant », son absence est son état fermé.
 */
export function UnderwayColumn({
  lines,
  nation,
  fresh,
  onLocate,
  onRecall,
}: {
  lines: ReadonlyArray<Underway>;
  nation: string;
  /** La ligne qu'un envoi vient d'ajouter, `null` le reste du temps. */
  fresh: string | null;
  onLocate: (line: Underway) => void;
  /** **Rappeler une ronde** (#376), depuis sa ligne. */
  onRecall?: (troopId: string) => void;
}) {
  const now = useClock();
  const [folded, setFolded] = useState(readUnderwayFolded);
  const section = useRef<HTMLElement>(null);
  const crowded = useCrowded(section, lines.length);
  if (lines.length === 0) return null;

  return (
    <section ref={section} className="hud flex flex-col items-start gap-[5px]">
      <button
        type="button"
        aria-expanded={!folded && !crowded}
        title={folded || crowded ? fr.underway.unfold : fr.underway.fold}
        onClick={() => {
          keepUnderwayFolded(!folded);
          setFolded(!folded);
        }}
        className="paper-grain flex h-[28px] cursor-pointer items-center gap-[7px] border border-[var(--ink)] px-[9px] text-[9.5px] font-semibold tracking-[.18em] text-[var(--ink-soft)] uppercase float"
      >
        {fr.underway.header}
        <span className="font-(family-name:--font-mono) text-[11px] tracking-normal text-[var(--ink)]">
          {lines.length}
        </span>
        <span aria-hidden className="tracking-normal text-[var(--ink)]">
          {folded || crowded ? '›' : '‹'}
        </span>
      </button>
      {(crowded ? [] : lines).map((line) => {
        const isFresh = line.id === fresh;
        const open = !folded || isFresh;
        const minutesLeft = (line.endsAt - now) / 60_000;
        const recall = line.recall;
        const row = (
          <button
            key={line.id}
            type="button"
            title={fr.underway.locate(line.label)}
            onClick={() => onLocate(line)}
            className={`flex h-[44px] cursor-pointer items-center gap-[7px] pr-[8px] pl-[4px] text-left float ${
              open ? 'w-[174px]' : 'w-[90px]'
            } ${isFresh ? 'border-2 border-[var(--ink)] bg-[color-mix(in_srgb,var(--paper),white_45%)]' : 'paper-grain border border-[var(--ink)]'}`}
          >
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center">
              <Face face={line.face} nation={nation} />
            </span>
            <span
              className={`flex min-w-0 flex-col gap-[3px] font-(family-name:--font-mono) leading-none font-medium ${
                line.moving ? 'text-[var(--notable-paper)]' : 'text-[var(--ink)]'
              } ${open ? 'text-[14px]' : 'text-[13px]'}`}
            >
              {open ? asDuration(minutesLeft) : asShortDuration(minutesLeft)}
              {open && (
                <span className="truncate font-(family-name:--font-body) text-[9.5px] leading-[1.1] font-normal tracking-[.06em] text-[var(--ink-soft)] uppercase">
                  {line.label}
                </span>
              )}
            </span>
          </button>
        );
        return recall === undefined || !open || onRecall === undefined ? (
          row
        ) : (
          <div key={line.id} className="flex items-stretch gap-[4px]">
            {row}
            <button
              type="button"
              onClick={() => onRecall(recall)}
              className="paper-grain float h-[44px] cursor-pointer border border-[var(--ink)] px-[8px] text-[9.5px] tracking-[.14em] uppercase"
            >
              {fr.patrol.recall}
            </button>
          </div>
        );
      })}
    </section>
  );
}

function Face({ face, nation }: { face: UnderwayFace; nation: string }) {
  switch (face.kind) {
    case 'unit':
      return face.role === null ? (
        <Pictogram pictogram="forces" weight={40} size={26} />
      ) : (
        <UnitSprite nation={nation} role={face.role} height={32} width={34} />
      );
    case 'building':
      return <BuildingPlate building={face.key} height={30} />;
    case 'outpost':
      return <Pictogram pictogram="outpost" weight={40} size={26} />;
  }
}
