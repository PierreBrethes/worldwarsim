import { useEffect, useRef, useState, type ReactNode } from 'react';
import { fr, roleLabel } from '@/i18n/fr';
import { loadCapacityOf, type TourRefusal } from '@/domain/logistics';
import type { StopCard } from '@/domain/tour-sheet-view';
import type { Offered, Refused } from '@/domain/tour-sheet';
import { BottomSheet } from '@/shell/BottomSheet';
import { useCoarsePointer, useNarrowScreen } from '@/shell/viewport';
import { scaleOf } from './dragging';
import type { TourSheetState } from './useTourSheet';

/** Un appui long saisit une carte au doigt. */
const LONG_PRESS_MS = 380;
/** Un écouteur de `touchstart` qui peut bloquer : sans lui, le navigateur n’attend pas notre `touchmove`. */
const blocking = () => {};
/** Au-delà, un doigt qui bouge défile : ce n'est pas un appui long. */
const SLIP_PX = 8;

const resourcesText = (amounts: Readonly<Record<string, number>>): string =>
  Object.entries(amounts)
    .filter(([, amount]) => amount > 0)
    .map(
      ([key, amount]) => `${Math.round(amount)} ${fr.resources[key as keyof typeof fr.resources]}`,
    )
    .join(', ');

/** **Le texte d'un refus**, comme l'écran le dirait pour le serveur ; la route refusée nomme ses deux bouts. */
const refusalText = (
  refused: Refused,
  baseName: string,
  nameOf: (stop: Refused['stop']) => string,
) => {
  const { code, ...details } = refused.refusal as TourRefusal;
  return fr.errors[code](
    code === 'TOUR_PICKUP_NO_ROUTE' ? { from: baseName, to: nameOf(refused.stop) } : details,
  );
};

/**
 * **La feuille de route d'un transport** (ADR 0041, #551 ; maquette `feuille-intelligente`, niveau
 * 2) : le chargement, chaque arrêt en carte à glisser, le retour qui verse au stock, puis la boucle.
 * La carte « + ajouter un arrêt » ouvre une carte vide qui classe les arrêts possibles et dit les
 * refus. Au bureau un panneau à gauche ; au téléphone, une demi-feuille qui monte du bas.
 */
export function TourSheet({ sheet }: { sheet: TourSheetState }) {
  const narrow = useNarrowScreen();
  const { reading } = sheet;
  if (reading === null) return null;
  const title = fr.tourSheet.eyebrow(roleLabel(reading.carrier.role, 1), reading.baseName);
  const body = <SheetBody sheet={sheet} />;
  if (narrow)
    return (
      <BottomSheet title={title} kicker onClose={sheet.close} initial="half" keepsSelection>
        {body}
      </BottomSheet>
    );
  return (
    <aside
      role="dialog"
      aria-label={title}
      className="tour-sheet hud paper-grain float"
      data-tour-sheet
    >
      <header className="tour-sheet-head">
        <span className="eyebrow">{title}</span>
        <button type="button" className="tour-sheet-x" onClick={sheet.close}>
          {fr.tourSheet.close}
        </button>
      </header>
      {body}
    </aside>
  );
}

function SheetBody({ sheet }: { sheet: TourSheetState }) {
  const { reading, analysis, cards, stops, touring, picking } = sheet;
  const touch = useCoarsePointer();
  const text = fr.tourSheet;
  const [drag, setDrag] = useState<Drag | null>(null);
  const els = useRef<Array<HTMLElement | null>>([]);
  const dragging = useRef<{ from: number; offset: number; over: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current !== null && clearTimeout(timer.current)), []);
  /** L'arrêt qu'on vient de poser se montre, où que la liste ait défilé : une fois, à sa pose. */
  const freshKey = sheet.cards.find((card) => card.fresh)?.key ?? null;
  useEffect(() => {
    if (freshKey === null) return;
    document.querySelector(`[data-stop="${freshKey}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [freshKey]);
  /** **Un doigt qui glisse une carte ne fait pas défiler** : l'écouteur est sur la carte dès le toucher
   *  (un écouteur posé après lui, ou sur la fenêtre, ne retient pas le défilement que le navigateur a
   *  déjà pris, et il envoie un `pointercancel`). */
  const holdStill = useRef((event: TouchEvent) => {
    if (dragging.current !== null) event.preventDefault();
  }).current;
  if (reading === null || analysis === null) return null;
  const { loop } = analysis;
  const capacity = loadCapacityOf(reading.carrier.role);
  const consigneSaid = resourcesText(reading.sheet.consigne);
  const bankedSaid = resourcesText(loop.banked);
  const keptSaid = resourcesText(loop.kept);
  const aboardAtReturn = Math.max(
    0,
    (loop.rows.at(-1)?.aboard ?? sumOf(reading.sheet.consigne)) -
      Object.values(loop.banked).reduce((sum, amount) => sum + amount, 0),
  );
  const baseCard = (
    <div className="tour-card tour-card--fixed" key="base">
      <span className="tour-n tour-n--base">{baseTag(reading.sheet.rules.place)}</span>
      <span className="tour-nm">{reading.baseName}</span>
      <span className="tour-aboard">
        <small>{text.aboard}</small>
        <b>{sumOf(reading.sheet.consigne)}</b>
      </span>
      <span className="tour-eff">
        {consigneSaid === '' ? text.loadsNothing : text.loads(consigneSaid)}
      </span>
    </div>
  );

  const begin = (index: number, clientY: number) => {
    const el = els.current[index];
    if (el === null || el === undefined) return;
    const box = el.getBoundingClientRect();
    /** `.hud` porte un `zoom` : le doigt mesure en pixels d'écran, la carte levée s'écrit en pixels de la surface. */
    const scale = scaleOf(el);
    dragging.current = { from: index, offset: clientY - box.top, over: index };
    setDrag({
      from: index,
      over: index,
      top: box.top / scale,
      left: box.left / scale,
      width: box.width / scale,
      height: box.height / scale,
      scale,
    });
    const move = (event: PointerEvent) => {
      const state = dragging.current;
      if (state === null) return;
      const over = els.current.reduce(
        (count, other, rank) =>
          other === null || other === undefined || rank === state.from
            ? count
            : count +
              (event.clientY > other.getBoundingClientRect().top + other.offsetHeight / 2 ? 1 : 0),
        0,
      );
      state.over = over;
      setDrag((was) =>
        was === null ? was : { ...was, top: (event.clientY - state.offset) / was.scale, over },
      );
    };
    const end = (event: PointerEvent) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      const state = dragging.current;
      dragging.current = null;
      setDrag(null);
      if (state !== null && event.type === 'pointerup' && state.over !== state.from)
        sheet.move(state.from, state.over);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  };

  const holdOnCard = (index: number) => (event: React.PointerEvent) => {
    if (event.pointerType === 'mouse' || touring || (event.target as Element).closest('.tour-rm'))
      return;
    const from = { x: event.clientX, y: event.clientY };
    const y = event.clientY;
    const slip = (step: PointerEvent) => {
      if (Math.hypot(step.clientX - from.x, step.clientY - from.y) > SLIP_PX) stopWatching();
    };
    const stopWatching = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      removeEventListener('pointermove', slip);
      removeEventListener('pointerup', stopWatching);
      removeEventListener('pointercancel', stopWatching);
    };
    addEventListener('pointermove', slip);
    addEventListener('pointerup', stopWatching);
    addEventListener('pointercancel', stopWatching);
    timer.current = setTimeout(() => {
      stopWatching();
      navigator.vibrate?.(20);
      begin(index, y);
    }, LONG_PRESS_MS);
  };

  const cardView = (card: StopCard, index: number, lifted: boolean): ReactNode => (
    <div
      key={card.key}
      ref={(node) => {
        if (lifted) return;
        els.current[index] = node;
        node?.addEventListener('touchstart', blocking, { passive: false });
        node?.addEventListener('touchmove', holdStill, { passive: false });
      }}
      data-stop={card.key}
      className={`tour-card${lifted ? ' tour-card--lifted' : ''}${card.fresh ? ' tour-card--fresh' : ''}`}
      style={
        lifted && drag !== null ? { top: drag.top, left: drag.left, width: drag.width } : undefined
      }
      onPointerDown={touring ? undefined : holdOnCard(index)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {!touring && (
        <span
          className="tour-grip"
          title={text.grip}
          onPointerDown={(event) => {
            if (event.pointerType !== 'mouse') return;
            event.preventDefault();
            begin(index, event.clientY);
          }}
        >
          ⋮⋮
        </span>
      )}
      <span className={`tour-n tour-n--${card.kind === 'depot' ? 'give' : 'take'}`}>
        {index + 1}
      </span>
      <span className="tour-nm">{card.name}</span>
      <span className="tour-aboard">
        <small>{text.aboard}</small>
        <b>{card.aboard}</b>
        <span className="tour-bar">
          <i style={{ width: `${capacity > 0 ? (card.aboard / capacity) * 100 : 0}%` }} />
        </span>
      </span>
      <span className="tour-eff">{card.effect}</span>
      <span className={`tour-note${card.warn ? ' tour-note--warn' : ''}`}>{card.note}</span>
      {!touring && (
        <button
          type="button"
          className="tour-rm"
          title={text.remove}
          onClick={() => sheet.remove(index)}
        >
          ✕
        </button>
      )}
    </div>
  );

  const rendered: ReactNode[] = [];
  const shown = cards
    .map((card, index) => ({ card, index }))
    .filter(({ index }) => drag?.from !== index);
  shown.forEach(({ card, index }, rank) => {
    if (drag !== null && drag.over === rank) rendered.push(slotView(drag, rank));
    rendered.push(cardView(card, index, false));
  });
  if (drag !== null && drag.over >= shown.length) rendered.push(slotView(drag, shown.length));

  const refusalNote =
    analysis.refusal === null || stops.length === 0 || touring
      ? null
      : (() => {
          const { code, ...details } = analysis.refusal;
          return fr.errors[code](details);
        })();

  return (
    <>
      <div className="tour-sheet-title">
        <h2>{touring ? text.titleRunning(stops.length) : text.titleTracing(stops.length)}</h2>
        <p>{touring ? text.hintReading : text.hintTracing(touch)}</p>
      </div>
      <div className="tour-sheet-body">
        {!touring && stops.length === 0 && !picking && (
          <div className="tour-propose">
            <span>{sheet.proposed ? text.proposeNone : text.proposeAsk}</span>
            <button type="button" onClick={sheet.propose}>
              {text.propose}
            </button>
          </div>
        )}
        {!touring && sheet.proposed && stops.length > 0 && (
          <div className="tour-propose tour-propose--done">
            <span>{text.proposed}</span>
          </div>
        )}
        {baseCard}
        {drag !== null && cardView(cards[drag.from]!, drag.from, true)}
        {rendered}
        <div className="tour-card tour-card--fixed" key="return">
          <span className="tour-n tour-n--base">{baseTag(reading.sheet.rules.place)}</span>
          <span className="tour-nm">{text.returnTo(reading.baseName)}</span>
          <span className="tour-aboard">
            <small>{text.aboard}</small>
            <b>{aboardAtReturn}</b>
          </span>
          <span className="tour-eff">
            {text.banks(bankedSaid === '' ? text.banksNothing : bankedSaid)}
          </span>
          {keptSaid !== '' && (
            <span className="tour-note tour-note--warn">{text.keptAboard(keptSaid)}</span>
          )}
        </div>
        {touring ? (
          <div className="tour-add tour-add--no">{text.hintRunning}</div>
        ) : picking ? (
          <PickCard sheet={sheet} />
        ) : stops.length >= 4 ? (
          <div className="tour-add tour-add--no">{text.full(4)}</div>
        ) : (
          <button type="button" className="tour-add" data-act="add" onClick={sheet.startPicking}>
            {text.add}
          </button>
        )}
      </div>
      <footer className="tour-sheet-foot">
        {!touring && analysis.order !== null && stops.length > 1 && <OrderLine sheet={sheet} />}
        {refusalNote !== null && <div className="tour-refusal">{refusalNote}</div>}
        <dl className="tour-sum">
          <dt>{text.loopLabel}</dt>
          <dd>{text.loop(loop.km, loop.minutes)}</dd>
          <dt>{text.rateLabel}</dt>
          <dd>{text.rate(Math.round(loop.ratePerHour))}</dd>
          <dt>{text.peakLabel}</dt>
          <dd>{text.peak(loop.peak, capacity)}</dd>
          <dt>{text.bankedLabel}</dt>
          <dd>{bankedSaid === '' ? text.banksNothing : bankedSaid}</dd>
        </dl>
      </footer>
      <div className="tour-btns">
        {touring ? (
          <button
            type="button"
            className="tour-solid"
            onClick={() => sheet.recall(reading.carrier.id)}
          >
            {text.recall}
          </button>
        ) : (
          <>
            <button type="button" className="tour-solid" onClick={sheet.launch}>
              {text.launch}
            </button>
            <button type="button" onClick={sheet.clear}>
              {text.clear}
            </button>
          </>
        )}
      </div>
    </>
  );
}

type Drag = {
  readonly from: number;
  readonly over: number;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
};

const slotView = (drag: Drag, key: number) => (
  <div key={`slot-${key}`} className="tour-slot" style={{ height: drag.height }} />
);

const sumOf = (load: { ammunition: number; oil: number; coal: number }) =>
  load.ammunition + load.oil + load.coal;

const baseTag = (place: { kind: string; key?: string }): string =>
  place.kind === 'building'
    ? (({ hq: 'QG', port: 'PORT', airfield: 'AÉRO', depot: 'ENT.' } as Record<string, string>)[
        place.key ?? ''
      ] ?? '▣')
    : 'AP';

function OrderLine({ sheet }: { sheet: TourSheetState }) {
  const text = fr.tourSheet;
  const order = sheet.analysis?.order;
  const loop = sheet.analysis?.loop;
  if (order === null || order === undefined || loop === undefined) return null;
  return (
    <div className="tour-propose">
      <span>
        {order.same
          ? text.orderSame(loop.km)
          : order.gain.moved > 0
            ? text.orderMoves(order.loop.moved, loop.moved)
            : text.orderShorter(order.loop.km, loop.km)}
      </span>
      {!order.same && (
        <button type="button" data-act="order" onClick={sheet.orderBestNow}>
          {text.order}
        </button>
      )}
    </div>
  );
}

/** **La carte vide qui propose** : les arrêts possibles classés, chacun avec sa raison, puis ceux qui ne s'ajoutent pas. */
function PickCard({ sheet }: { sheet: TourSheetState }) {
  const text = fr.tourSheet;
  /** La carte vide s'ouvre sous les yeux, une fois. */
  const here = useRef<HTMLDivElement>(null);
  useEffect(() => {
    here.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  /** Un refus choisi quand même se montre, sa raison dite sous les yeux. */
  const pinnedKey = sheet.pinned === null ? null : `${sheet.pinned.kind}:${sheet.pinned.id}`;
  useEffect(() => {
    if (pinnedKey !== null)
      here.current?.querySelector('.tour-opt--pinned')?.scrollIntoView({ block: 'nearest' });
  }, [pinnedKey]);
  const { analysis, reading, stops } = sheet;
  const ranked = analysis?.ranked;
  if (ranked === null || ranked === undefined || reading === null || analysis === null) return null;
  const useless = ranked.offered.length > 0 && ranked.offered.every((offer) => offer.moved === 0);
  return (
    <div className="tour-pick" data-pick-card ref={here}>
      <div className="tour-pick-head">
        <b>{text.pickTitle(stops.length + 1)}</b>
        <button type="button" onClick={sheet.stopPicking}>
          {text.cancel}
        </button>
      </div>
      <span className="tour-hint">{text.pickHint(Math.round(analysis.loop.ratePerHour))}</span>
      {sheet.pending && <span className="tour-hint">{text.pickLoading}</span>}
      {useless && <span className="tour-hint tour-hint--warn">{text.pickUseless}</span>}
      {ranked.offered.length === 0 && !sheet.pending && ranked.refused.length === 0 && (
        <span className="tour-hint">{text.pickNone}</span>
      )}
      {ranked.offered.map((offer, rank) => (
        <OfferRow
          key={`${offer.stop.kind}:${offer.stop.id}`}
          offer={offer}
          rank={rank}
          sheet={sheet}
        />
      ))}
      {ranked.refused.length > 0 && <span className="tour-group">{text.refusedGroup}</span>}
      {ranked.refused.map((refused) => (
        <button
          type="button"
          key={`${refused.stop.kind}:${refused.stop.id}`}
          className={`tour-opt tour-opt--no${
            sheet.pinned?.kind === refused.stop.kind && sheet.pinned.id === refused.stop.id
              ? ' tour-opt--pinned'
              : ''
          }`}
          onClick={() => sheet.pick(refused.stop)}
        >
          <span className="tour-r tour-r--no">✕</span>
          <b>{reading.nameOf(refused.stop)}</b>
          <span className="tour-why">{refusalText(refused, reading.baseName, reading.nameOf)}</span>
        </button>
      ))}
    </div>
  );
}

function OfferRow({ offer, rank, sheet }: { offer: Offered; rank: number; sheet: TourSheetState }) {
  const text = fr.tourSheet;
  const { reading } = sheet;
  if (reading === null) return null;
  const { stop, slot } = offer;
  return (
    <button
      type="button"
      className="tour-opt"
      data-offer={`${stop.kind}:${stop.id}`}
      onClick={() => sheet.pick(stop)}
    >
      <span className="tour-r">{rank + 1}</span>
      <b>{reading.nameOf(stop)}</b>
      <span className="tour-why">{text.reason(offer.reason)}</span>
      <span className="tour-eff">
        {stop.kind === 'depot' ? '▼' : '▲'} {offer.moved}
        {stop.kind === 'site' ? ` ${fr.resources[stop.resource]}` : ''}
        <br />
        <small>{text.slot(slot.at + 1, slot.addedKm, Math.round(offer.gain))}</small>
      </span>
    </button>
  );
}
