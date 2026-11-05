import { useEffect, useRef, useState } from 'react';
import { chainRefusalOf, secondTargetRefusalOf } from '@/domain/blitzkrieg';
import { asSpan } from '@/domain/duration';
import type { LonLat } from '@/domain/geo';
import { refusalDetails, type Column } from '@/domain/movement-orders';
import type { Asset } from '@/domain/nation-assets';
import { placeLabel } from '@/domain/station-name';
import type { MarchStation } from '@/domain/troops';
import type { MovementPreviewed } from '@/data/serverView';
import { fr } from '@/i18n/fr';
import type { ChainChip } from '@/map/DropHint';
import type { OrderChoice, Previewed } from './order-wire';
import { refusalText, type ChainedFirst } from './useOrderPreview';

/**
 * **La Guerre éclair sous la main** (ADR 0039 §6, maquette A « Maj ») : Maj tenue au lâcher pose
 * la première jambe et garde la colonne en main ; au téléphone, la languette « puis » tient lieu
 * de Maj. La règle est celle du serveur (`src/domain/blitzkrieg.ts`).
 */
export function useChainKey(active: boolean) {
  const [held, setHeld] = useState(false);
  const ref = useRef(false);
  const hold = (on: boolean) => {
    ref.current = on;
    setHeld(on);
  };
  useEffect(() => {
    if (!active) {
      ref.current = false;
      setHeld(false);
      return;
    }
    const press = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') return;
      ref.current = event.type === 'keydown';
      setHeld(ref.current);
    };
    const lose = () => {
      ref.current = false;
      setHeld(false);
    };
    addEventListener('keydown', press);
    addEventListener('keyup', press);
    addEventListener('blur', lose);
    return () => {
      removeEventListener('keydown', press);
      removeEventListener('keyup', press);
      removeEventListener('blur', lose);
    };
  }, [active]);
  return { held, ref, hold };
}

type SecondFacts = NonNullable<NonNullable<MovementPreviewed>['then']> | undefined;

/** **La seconde cible, refusée** : la même règle que l'ordre, puis ce que seul le serveur pèse
 *  (la route, le plein après la première jambe). `null` : elle part. */
export function secondRefusalOf(
  asset: Asset | null,
  chain: ChainedFirst,
  chosen: OrderChoice,
  then: SecondFacts,
  column: Column,
): string | null {
  if (chosen.mission.kind !== 'march')
    return fr.errors.CHAIN_ATTACK_ONLY({
      type: chosen.mission.kind === 'capture' ? 'capture' : chosen.type,
    });
  const code = secondTargetRefusalOf(
    asset,
    { aim: chain.first.aim, legs: chain.preview.route.legs },
    { aim: chosen.aim, legs: then?.refusal === null ? then.route.legs : null },
    column,
  );
  if (code !== null)
    return refusalText({
      code,
      details: refusalDetails(chosen.aim, column) as Record<string, string | number | boolean>,
    });
  return then?.refusal != null ? refusalText(then.refusal) : null;
}

/** Ce que la pastille ajoute ou change, à l'arrêt de la main : `null` hors de l'atout. */
export function chainChipOf({
  asset,
  key,
  chain,
  resting,
  preview,
  then,
  column,
}: {
  readonly asset: Asset | null;
  readonly key: boolean;
  readonly chain: ChainedFirst | null;
  readonly resting: OrderChoice | null;
  readonly preview: Previewed | undefined;
  readonly then: SecondFacts;
  readonly column: Column | null;
}): ChainChip | null {
  if (asset !== 'blitzkrieg' || column === null) return null;
  if (chain !== null) {
    const first = placeLabel(chain.preview.destinationName);
    const held = then?.refusal === null ? then : null;
    return {
      kind: 'second',
      first,
      then: held === null ? null : placeLabel(held.destinationName),
      span: held === null ? null : asSpan(held.minutes),
      refusal: resting === null ? null : secondRefusalOf(asset, chain, resting, then, column),
    };
  }
  if (resting === null) return null;
  const marched = marchPreviewOf(resting, preview);
  const refusal = chainRefusalOf(asset, resting, marched?.route.legs ?? null);
  if (!key) return refusal === null ? { kind: 'offer' } : null;
  if (refusal !== null)
    return {
      kind: 'refused',
      reason: refusalText({
        code: refusal,
        details: { type: resting.mission.kind === 'capture' ? 'capture' : resting.type },
      }),
    };
  return marched === null
    ? { kind: 'offer' }
    : {
        kind: 'armed',
        first: placeLabel(marched.destinationName),
        span: asSpan(marched.minutes),
      };
}

/** L'aperçu d'une attaque sans mission, le seul qui enchaîne. */
export const marchPreviewOf = (
  chosen: OrderChoice,
  preview: Previewed | undefined,
): NonNullable<MovementPreviewed> | null =>
  chosen.mission.kind === 'march' && preview && 'pursuit' in preview ? preview : null;

/** **Où la colonne se tient entre ses deux cibles** : au point de la première, à terre. */
export const firstPointOf = (preview: NonNullable<MovementPreviewed>): MarchStation => {
  const end = preview.route.points.at(-1)!;
  return {
    kind: 'point',
    lonLat: [end.lon, end.lat] as LonLat,
    country: '',
    afloat: false,
    ground: 'land',
    coastal: false,
  };
};

/** **La languette « puis »** (maquette A) : au bord, sous le pouce libre ; tenue, elle arme. */
export function ChainTab({ held, onHold }: { held: boolean; onHold: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={held}
      className={`chain-tab paper-grain${held ? ' chain-tab--held' : ''}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="chain-tab-label">{fr.blitzkrieg.tab}</span>
      <small>{held ? fr.blitzkrieg.tabHeld : fr.blitzkrieg.tabIdle}</small>
    </button>
  );
}
