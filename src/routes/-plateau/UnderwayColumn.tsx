import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { asDuration, asShortDuration } from '@/domain/duration';
import type { Underway, UnderwayFace } from '@/domain/underway';
import { keepUnderwayFolded, readUnderwayFolded } from '@/data/settings';
import { BuildingPlate } from '@/emblems/Plate';
import { UnitSprite } from '@/emblems/UnitSprite';
import { Pictogram } from '@/shell/IndicatorGlyph';
import { useClock } from '@/shell/clock';

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
}: {
  lines: ReadonlyArray<Underway>;
  nation: string;
  /** La ligne qu'un envoi vient d'ajouter, `null` le reste du temps. */
  fresh: string | null;
  onLocate: (line: Underway) => void;
}) {
  const now = useClock();
  const [folded, setFolded] = useState(readUnderwayFolded);
  if (lines.length === 0) return null;

  return (
    <section className="hud flex flex-col items-start gap-[5px]">
      <button
        type="button"
        aria-expanded={!folded}
        title={folded ? fr.underway.unfold : fr.underway.fold}
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
          {folded ? '›' : '‹'}
        </span>
      </button>
      {lines.map((line) => {
        const isFresh = line.id === fresh;
        const open = !folded || isFresh;
        const minutesLeft = (line.endsAt - now) / 60_000;
        return (
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
