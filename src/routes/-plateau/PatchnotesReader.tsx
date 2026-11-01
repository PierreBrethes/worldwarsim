import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { fr } from '@/i18n/fr';
import { markPatchnoteRead } from '@/data/patchnotes';
import { useMapMotion } from '@/data/mapMotion';
import { limitOf, turnOf, type Patchnote } from '@/domain/patchnotes';
import { useCoarsePointer, useNarrowScreen } from '@/shell/viewport';

const OFF_LEFT = 'translateX(-112%)';
const MAX_ZOOM = 4;
/** Un pas de loupe : un clic à la souris, un double toucher au doigt. @a-mesurer */
const ZOOM_STEP = { desk: 2, phone: 2.5 };
/** Au-delà de cette part de la largeur, ou de cette vitesse, un glissé tourne la feuille. @a-mesurer */
const DRAG_TURN = 0.15;
const DRAG_FLICK = 0.5;
const DOUBLE_TAP_MS = 320;
const SNAP_MS = 220;
const KBD =
  'border border-[rgba(228,216,189,.4)] px-[5px] py-px font-[inherit] text-[var(--paper)]';
const MUTED = '#b9aa8a';

type Pt = { x: number; y: number };
type Pan = { z: number; px: number; py: number };

/**
 * **La liseuse des bulletins** : plein écran, dans l'ordre du temps (← plus ancien, → plus
 * récent). La feuille du dessus part de côté, celle d'en dessous reste en place. Le mouvement
 * suit `map-motion` : « actives » la feuille suit le doigt et glisse, « réduites » elle ne suit
 * pas et fond, « coupées » elle change d'un coup.
 */
export function PatchnotesReader({
  notes,
  startDate,
  unread,
  onClose,
}: {
  /** Le plus récent d'abord, comme l'index. */
  notes: ReadonlyArray<Patchnote>;
  startDate: string;
  unread: ReadonlySet<string>;
  onClose: () => void;
}) {
  const chrono = [...notes].reverse();
  const count = chrono.length;
  const [at, setAt] = useState(() =>
    Math.max(
      0,
      chrono.findIndex((n) => n.date === startDate),
    ),
  );
  const [turning, setTurning] = useState<-1 | 1 | null>(null);
  const [fade, setFade] = useState<'out' | 'hold' | 'in' | null>(null);
  const [drag, setDrag] = useState(0);
  const [zoom, setZoom] = useState<Pan>({ z: 1, px: 0, py: 0 });
  const motion = turnOf(useMapMotion());
  const narrow = useNarrowScreen();
  const coarse = useCoarsePointer();
  const stage = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLImageElement>(null);
  const busy = turning !== null || fade !== null;
  const note = chrono[at]!;

  useEffect(() => closeButton.current?.focus({ preventScroll: true }), []);
  useEffect(() => markPatchnoteRead(note.date), [note.date]);

  const go = (target: number) => {
    if (busy || target < 0 || target >= count || target === at) return;
    const commit = () => {
      setAt(target);
      setTurning(null);
      setDrag(0);
      setZoom({ z: 1, px: 0, py: 0 });
    };
    if (motion.kind === 'cut') return commit();
    if (motion.kind === 'fade') {
      setFade('out');
      setTimeout(() => {
        commit();
        setFade('hold');
        requestAnimationFrame(() => requestAnimationFrame(() => setFade('in')));
        setTimeout(() => setFade(null), motion.ms);
      }, motion.ms);
      return;
    }
    setTurning(target > at ? 1 : -1);
    setTimeout(commit, motion.ms + 10);
  };
  const step = (d: -1 | 1) => go(at + d);

  // Les touches sont prises avant la fenêtre des Réglages et la carte : la liseuse est au-dessus.
  const keys = useRef({ step, onClose });
  keys.current = { step, onClose };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const act =
        event.key === 'ArrowLeft'
          ? () => keys.current.step(-1)
          : event.key === 'ArrowRight'
            ? () => keys.current.step(1)
            : event.key === 'Escape'
              ? () => keys.current.onClose()
              : null;
      if (act === null) return;
      event.stopPropagation();
      event.preventDefault();
      act();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // ---- la loupe : clic ou double toucher, pincement, déplacement une fois agrandi ----
  const clampPan = (view: Pan): Pan => {
    const img = sheet.current;
    if (img === null) return view;
    return {
      z: view.z,
      px: Math.max(-(view.z - 1) * img.offsetWidth, Math.min(0, view.px)),
      py: Math.max(-(view.z - 1) * img.offsetHeight, Math.min(0, view.py)),
    };
  };
  const zoomAt = (cx: number, cy: number, next: number) => {
    const img = sheet.current;
    if (img === null) return;
    const r = img.getBoundingClientRect();
    const fx = (cx - r.left) / zoom.z;
    const fy = (cy - r.top) / zoom.z;
    setZoom(
      clampPan({
        z: next,
        px: cx - (r.left - zoom.px) - fx * next,
        py: cy - (r.top - zoom.py) - fy * next,
      }),
    );
  };

  const pts = useRef(new Map<number, Pt>());
  const gesture = useRef<{
    x: number;
    y: number;
    t: number;
    px: number;
    py: number;
    moved: boolean;
  } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const lastTap = useRef(0);

  const onDown = (event: PointerEvent) => {
    if (busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pts.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()] as [Pt, Pt];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom.z };
      gesture.current = null;
    } else {
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        t: performance.now(),
        px: zoom.px,
        py: zoom.py,
        moved: false,
      };
    }
  };
  const onMove = (event: PointerEvent) => {
    if (!pts.current.has(event.pointerId)) return;
    pts.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current !== null && pts.current.size === 2) {
      const [a, b] = [...pts.current.values()] as [Pt, Pt];
      const spread = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d;
      return zoomAt(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.max(1, Math.min(MAX_ZOOM, pinch.current.z * spread)),
      );
    }
    const g = gesture.current;
    if (g === null) return;
    const dx = event.clientX - g.x;
    const dy = event.clientY - g.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
    if (zoom.z > 1) return setZoom(clampPan({ z: zoom.z, px: g.px + dx, py: g.py + dy }));
    if (motion.kind !== 'slide' || !g.moved) return;
    // Au bout de la liasse la feuille résiste : elle suit au tiers.
    const edge = (dx > 0 && at === 0) || (dx < 0 && at === count - 1);
    setDrag(edge ? dx / 3 : dx);
  };
  const onUp = (event: PointerEvent) => {
    if (!pts.current.delete(event.pointerId)) return;
    if (pinch.current !== null) {
      if (pts.current.size === 0) pinch.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (g === null) return;
    if (!g.moved) {
      const now = performance.now();
      if (event.pointerType === 'mouse' || now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        if (zoom.z > 1) setZoom({ z: 1, px: 0, py: 0 });
        else zoomAt(event.clientX, event.clientY, narrow ? ZOOM_STEP.phone : ZOOM_STEP.desk);
      } else lastTap.current = now;
      return;
    }
    if (zoom.z > 1) return;
    const dx = event.clientX - g.x;
    const width = stage.current?.clientWidth ?? 1;
    const flick = Math.abs(dx) / (performance.now() - g.t) > DRAG_FLICK;
    // Glisser vers la gauche amène la feuille suivante, la plus récente.
    if (Math.abs(dx) > width * DRAG_TURN || flick) {
      const dir = dx < 0 ? (1 as const) : (-1 as const);
      if (limitOf(at, dir, count) === null) return go(at + dir);
    }
    setDrag(0);
  };

  const settle = motion.kind === 'slide' ? `transform ${SNAP_MS}ms var(--ease-out)` : 'none';
  const transition =
    turning !== null ? `transform ${motion.ms}ms var(--ease-out)` : drag !== 0 ? 'none' : settle;
  const slideStyle = (k: -1 | 0 | 1): CSSProperties => {
    let transform = '';
    if (k === 0) {
      if (turning === 1) transform = `${OFF_LEFT} rotate(-4deg)`;
      else if (drag < 0) transform = `translateX(${drag}px) rotate(${drag / 120}deg)`;
      else if (at === 0 && drag > 0) transform = `translateX(${drag}px)`;
    } else if (k === -1) {
      transform =
        turning === -1
          ? 'translateX(0)'
          : drag > 0
            ? `translateX(calc(-112% + ${drag}px))`
            : OFF_LEFT;
    }
    return { transform, transition, zIndex: k === 0 ? 2 : k < 0 ? 3 : 1 };
  };

  const ts = chrono.map((n) => Date.parse(n.date));
  const stripAt = (index: number): number => {
    const lo = Math.min(...ts);
    const hi = Math.max(...ts);
    return hi === lo ? 50 : 4 + (((ts[index] ?? lo) - lo) / (hi - lo)) * 92;
  };

  const arrow = (d: -1 | 1) => {
    const limit = limitOf(at, d, count);
    if (limit !== null)
      return (
        <span
          className="max-w-[100px] text-center font-(family-name:--font-text) text-[13px] leading-[1.35] italic max-md:max-w-[120px] max-md:text-[12px]"
          style={{ color: MUTED }}
        >
          {limit === 'first' ? fr.patchnotes.firstLimit : fr.patchnotes.lastLimit}
        </span>
      );
    const label = d < 0 ? fr.patchnotes.older : fr.patchnotes.newer;
    return (
      <button
        type="button"
        aria-label={label}
        onClick={() => step(d)}
        className="group grid cursor-pointer justify-items-center gap-2 p-[10px] text-[9px] leading-[1.2] font-semibold tracking-[.18em] text-[var(--paper)] uppercase max-md:p-[6px_0]"
      >
        <b className="grid h-[52px] w-[52px] place-items-center border border-[var(--paper)] font-(family-name:--font-display) text-[28px] font-normal group-hover:bg-[var(--paper)] group-hover:text-[var(--ink)] max-md:h-10 max-md:w-10 max-md:text-[22px]">
          {d < 0 ? '‹' : '›'}
        </b>
        <span className="max-md:hidden">{label}</span>
      </button>
    );
  };

  const fading = fade === 'out' || fade === 'hold';
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={fr.patchnotes.reader}
      className="fixed inset-0 z-[var(--z-notice)] flex flex-col bg-[var(--desk)] text-[var(--paper)]"
    >
      <div className="flex items-center gap-4 border-b border-[rgba(228,216,189,.18)] px-5 py-[14px] max-md:gap-[10px] max-md:px-4 max-md:py-[10px]">
        <div className="min-w-0 flex-1">
          <div
            className="text-[9px] leading-[1.2] font-semibold tracking-[.18em] uppercase"
            style={{ color: MUTED }}
          >
            {fr.patchnotes.reader} · {fr.patchnotes.dateLong(note.date)}
          </div>
          <h1 className="mt-1 font-(family-name:--font-display) text-[19px] leading-[1.15] font-bold max-md:text-[16px]">
            {note.title}
          </h1>
        </div>
        <span
          aria-live="polite"
          className="font-(family-name:--font-mono) text-[15px] whitespace-nowrap"
        >
          {fr.patchnotes.position(at + 1, count)}
        </span>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="cursor-pointer border border-[var(--paper)] px-[9px] py-1 text-[9px] tracking-[.18em] uppercase hover:bg-[var(--paper)] hover:text-[var(--ink)]"
        >
          {fr.patchnotes.close}
        </button>
      </div>

      <div className="relative mx-[60px] mt-[6px] h-[54px] shrink-0 max-md:mx-[22px] max-md:h-[46px]">
        <i className="absolute top-4 right-0 left-0 border-t border-[rgba(228,216,189,.45)]" />
        {chrono.map((n, index) => {
          const current = index === at;
          const dot = unread.has(n.date) && !current;
          return (
            <button
              key={n.date}
              type="button"
              aria-label={fr.patchnotes.dateLong(n.date)}
              aria-current={current ? 'true' : undefined}
              onClick={() => go(index)}
              style={{ left: `${stripAt(index)}%`, color: current ? 'var(--paper)' : MUTED }}
              className="absolute top-2 grid -translate-x-1/2 cursor-pointer justify-items-center gap-[7px] font-(family-name:--font-mono) text-[10px] leading-none whitespace-nowrap max-md:text-[8.5px]"
            >
              <i
                className="rounded-full border-[1.5px] border-current"
                style={{
                  width: current ? 17 : 13,
                  height: current ? 17 : 13,
                  marginTop: current ? -2 : 0,
                  background: current ? 'var(--paper)' : dot ? 'var(--critical)' : 'var(--desk)',
                  borderColor: dot ? 'var(--critical)' : undefined,
                  boxShadow: current ? '0 0 0 4px rgba(228,216,189,.2)' : undefined,
                }}
              />
              <span>
                {narrow ? fr.patchnotes.dateDots(n.date) : fr.patchnotes.dateShort(n.date)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1 items-stretch">
        <div className="grid w-[120px] shrink-0 place-items-center max-md:hidden">{arrow(-1)}</div>
        <div
          ref={stage}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative min-w-0 flex-1 touch-none overflow-hidden"
          style={{
            opacity: fading ? 0 : 1,
            transition: fade === 'out' || fade === 'in' ? `opacity ${motion.ms}ms linear` : 'none',
          }}
        >
          {([-1, 0, 1] as const).map((k) => {
            const n = chrono[at + k];
            if (n === undefined) return null;
            const top = k === 0;
            return (
              <div
                key={n.date}
                className="absolute inset-0 flex items-center justify-center p-[18px] max-md:px-4 max-md:py-3"
                style={slideStyle(k)}
              >
                <img
                  ref={top ? sheet : undefined}
                  src={n.image}
                  alt={top && !narrow ? n.summary : ''}
                  draggable={false}
                  className="block max-h-full max-w-full min-h-0 min-w-0 origin-top-left cursor-zoom-in bg-[var(--paper)] object-contain select-none"
                  style={{
                    boxShadow: top
                      ? narrow
                        ? '3px 3px 0 var(--paper-pile), 6px 6px 0 var(--paper-pile-2), 0 14px 30px rgba(0,0,0,.6)'
                        : '6px 6px 0 var(--paper-pile), 12px 12px 0 var(--paper-pile-2), 0 24px 50px rgba(0,0,0,.6)'
                      : '0 24px 50px rgba(0,0,0,.6)',
                    transform:
                      top && zoom.z > 1
                        ? `translate(${zoom.px}px, ${zoom.py}px) scale(${zoom.z})`
                        : undefined,
                    cursor: zoom.z > 1 ? 'grab' : undefined,
                  }}
                />
              </div>
            );
          })}
          {zoom.z > 1 && (
            <span className="absolute bottom-3 left-1/2 z-[3] -translate-x-1/2 border border-[var(--ink)] bg-[var(--paper)] px-[9px] py-[6px] text-[9px] leading-none font-semibold tracking-[.14em] whitespace-nowrap text-[var(--ink)] uppercase">
              {fr.patchnotes.loupe(zoom.z, coarse)}
            </span>
          )}
        </div>
        <div className="grid w-[120px] shrink-0 place-items-center max-md:hidden">{arrow(1)}</div>
      </div>

      {/* Au téléphone, la feuille est trop petite pour se lire : son résumé se pose dessous. */}
      {narrow && (
        <div className="max-h-[34%] shrink-0 overflow-auto overscroll-contain border-t border-[rgba(228,216,189,.18)] px-4 py-[10px]">
          <p className="font-(family-name:--font-text) text-[13px] leading-[1.45]">
            {note.summary}
          </p>
        </div>
      )}

      <div
        className="flex shrink-0 items-center justify-center gap-[18px] px-5 pt-[10px] pb-[14px] font-(family-name:--font-mono) text-[10px] leading-[1.3] max-md:justify-between max-md:gap-2 max-md:px-4 max-md:pb-[calc(12px+env(safe-area-inset-bottom))]"
        style={{ color: MUTED }}
      >
        <span className="md:hidden">{arrow(-1)}</span>
        <span className="max-md:flex-1 max-md:text-center">
          {narrow ? (
            fr.patchnotes.touchHint
          ) : (
            <>
              <kbd className={KBD}>←</kbd> <kbd className={KBD}>→</kbd> {fr.patchnotes.keys} ·{' '}
              <kbd className={KBD}>Échap</kbd> {fr.patchnotes.keysClose} · {fr.patchnotes.keysLoupe}
            </>
          )}
        </span>
        <span className="md:hidden">{arrow(1)}</span>
      </div>
    </div>,
    document.body,
  );
}
