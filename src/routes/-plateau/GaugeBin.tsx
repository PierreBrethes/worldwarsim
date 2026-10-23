import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { fr } from '@/i18n/fr';
import type { Density } from './board-density';
import type { ResourceKey } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { displayedStock } from '@/domain/reserve-counter';
import { useMapMotion, usePrefersReducedMotion } from '@/data/mapMotion';
import { ResourcePlate } from '@/emblems/Plate';
import { resourceColor } from '@/emblems/resource-color';
import {
  DryTag,
  FullTag,
  Odometer,
  reserveReading,
  ReserveTag,
  useAnnouncedStock,
  usePinning,
} from '@/shell/ReserveCell';

/** The plate's height at each density, beside the variables `index.css` sets (a plate is sized in
 *  pixels, not by a variable). */
const PLATE_PX = { ample: 22, moyen: 19, serre: 17 } as const satisfies Record<Density, number>;

export type BinProps = {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  shown: number | null;
  register: (node: HTMLElement | null) => void;
  /** Munitions, pétrole et charbon se prennent ici pour charger un transport. */
  onTake: ((event: ReactPointerEvent<HTMLElement>) => void) | null;
};

/** **Un bac en thermomètre** : l'icône, le tube, possédé / max, puis le débit net — ou l'étiquette
 *  « à sec » ou « plein » qui le remplace, les mêmes que la ligne repliée —, centrés dans la
 *  hauteur de la bande pour que les marges du haut et du bas soient égales. Le chiffre roule et
 *  s'annonce comme celui de la ligne (`ReserveCell`) ; ses mesures suivent la densité de la bande
 *  (`.mat-board`, `index.css`). */
export function GaugeBin({
  resource,
  register,
  onTake,
  view,
  now,
  shown,
  density,
}: BinProps & { density: Density }) {
  const {
    reserve: held,
    stock,
    share,
    alert,
    full,
    title,
  } = reserveReading(view, resource, now, shown);
  const motion = useMapMotion();
  const reduced = usePrefersReducedMotion();
  const still = motion === 'off' || reduced;
  const announced = useAnnouncedStock(held, view.loadedAt, still);
  return (
    <button
      type="button"
      ref={register as Ref<HTMLButtonElement>}
      data-bin={resource}
      title={onTake === null ? title : `${title} — ${fr.logistics.grab}`}
      aria-label={title}
      {...usePinning(resource, onTake)}
      className={`mat-bin relative grid touch-none content-center justify-items-center gap-[6px] select-none ${
        onTake === null ? 'cursor-pointer' : 'cursor-grab hover:bg-(--arc-mine)/12'
      }`}
    >
      <ResourcePlate resource={resource} height={PLATE_PX[density]} />
      <span
        aria-hidden
        className="relative h-(--tube-h) w-(--tube-w) overflow-hidden rounded-[calc(var(--tube-w)/2)_calc(var(--tube-w)/2)_3px_3px] border-[1.5px] border-[var(--ink)] bg-white/25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to top, transparent 0 14.5px, color-mix(in srgb, var(--ink) 35%, transparent) 14.5px 15.5px)',
        }}
      >
        <i
          className="mat-gauge absolute inset-x-0 bottom-0"
          style={{ height: `${share * 100}%`, background: resourceColor(resource, true) }}
        />
      </span>
      <span
        aria-hidden
        className="relative font-(family-name:--font-mono) text-[11px] leading-none whitespace-nowrap"
      >
        <b
          className="inline-flex text-(length:--bin-n) font-semibold"
          style={alert === null ? undefined : { color: 'var(--critical)' }}
        >
          <Odometer
            value={shown ?? (still ? stock : displayedStock(announced.shown, stock))}
            roll={shown === null && motion === 'full' && !still}
          />
        </b>{' '}
        <small className="mat-bin-cap text-(length:--bin-s) text-[var(--ink-soft)]">
          {fr.personalBoard.ofCap(held.cap)}
        </small>
        {announced.tag !== null && shown === null && (
          <ReserveTag
            gain={announced.tag.gain}
            alarm={alert !== null && !announced.tag.spent}
            quiet={motion === 'reduced'}
            spot={{ left: '50%', bottom: 'calc(100% + 4px)', transform: 'translateX(-50%)' }}
            onDone={announced.clearTag}
            key={announced.tag.id}
          />
        )}
      </span>
      {alert !== null ? (
        <DryTag label={alert} />
      ) : full ? (
        <FullTag />
      ) : (
        <small
          aria-hidden
          className="font-(family-name:--font-mono) text-(length:--bin-s) leading-none whitespace-nowrap"
          style={{ color: held.ratePerHour < 0 ? 'var(--critical)' : 'var(--ink-soft)' }}
        >
          {fr.personalBoard.rate(held.ratePerHour)}
        </small>
      )}
    </button>
  );
}
