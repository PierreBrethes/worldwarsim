// Le moteur de carte est une classe impérative à qui on assigne `.onContacts` : React Compiler
// lit ça comme une mutation interdite (voir EdgeIndicators).
'use no memo';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { asClockTime } from '@/domain/duration';
import type { Contact } from '@/domain/contacts';
import {
  clampToEdge,
  cluster,
  EDGE_MARGIN,
  HALF_BADGE,
  sideOf,
  type EdgePoint,
  type IndicatorGroup,
} from '@/domain/indicators';
import type { Rect } from '@/domain/poster-placement';
import { fr } from '@/i18n/fr';
import { useBoardInsets, useCoarsePointer, type BoardInsets } from '@/shell/viewport';
import type { ContactSpot } from './engine/contact-rings';
import { ARC_COLORS } from './engine/palette';
import { PIN_APPROACH_DISTANCE } from './engine/pins';
import type { MapEngine } from './engine';
import { useLayerSize } from './layer-size';

/**
 * **Les accrochages, numérotés et légendés** (#441, maquette `carte-lisible` C) : le numéro sur
 * le cercle que le moteur trace, et le cartouche qui nomme l'accrochage, relié par un fil. Hors
 * champ, son numéro reste au bord, un jeton par bord comme les indicateurs, sous la bascule du
 * renseignement. Le cartouche choisit sa place quand la caméra s'arrête, avant les noms du
 * décor, qui lui cèdent ; entre deux arrêts il suit son cercle.
 */
export function ContactMarks({
  contacts,
  engine,
  intel,
  ink,
}: {
  contacts: ReadonlyArray<Contact>;
  engine: MapEngine | null;
  /** The intel toggle: what folds a contact to the edge. */
  intel: boolean;
  /** My nation's ink, for the cartouche's dot of mine. */
  ink: string | null;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const size = useLayerSize(layer);
  const compact = useCoarsePointer();
  const insets = useBoardInsets();
  const latest = useRef<ReadonlyArray<ContactSpot> | null>(null);
  /** The spot each cartouche took at the last rest, by number: `ASIDE`, none was free, and it
   *  stands by its circle; `NONE`, that would cover another cartouche, and the number alone says it. */
  const chosen = useRef(new Map<number, number>());
  const cards = useRef(new Map<number, HTMLElement>());
  /** Each cartouche's size, measured at rest: a frame does not read the layout. */
  const sizes = useRef(new Map<number, readonly [number, number]>());
  const badges = useRef(new Map<number, HTMLElement>());
  const threads = useRef(new Map<number, SVGLineElement>());
  const tokens = useRef(new Map<string, HTMLElement>());
  const [edges, setEdges] = useState<ReadonlyArray<IndicatorGroup>>([]);
  /** The board's insets, and the personal board's band at the bottom, read at rest. */
  const edgeInsets = useRef<BoardInsets>(insets);
  const [drawn, setDrawn] = useState(false);

  const cardRect = useCallback(
    (spot: ContactSpot, node: HTMLElement): Rect | null => {
      const [w, h] = sizes.current.get(spot.number) ?? measure(sizes.current, spot.number, node);
      const spots = cartoucheSpots(spot, w, h);
      const k = chosen.current.get(spot.number) ?? 0;
      if (k === NONE) return null;
      if (k !== ASIDE) return spots[k]!;
      const { left: from, right: to } = bandOf(edgeInsets.current);
      const left = Math.max(from, Math.min(size.current.width - to - w, spot.x + spot.rx + 6));
      const top = spot.y - h / 2;
      return { left, top, right: left + w, bottom: top + h };
    },
    [size],
  );

  const place = useCallback(() => {
    if (engine === null) return;
    const spots = latest.current ?? [];
    const { width, height } = size.current;
    edgeInsets.current = { ...insets, bottom: Math.max(insets.bottom, matBand(layer.current)) };
    // Inside the band the indicators' tokens keep at the edge, whether they stand there yet or not.
    const box = bandOf(edgeInsets.current);
    const taken: Rect[] = engine.markRects();
    const held: Rect[] = [];
    const inside = spots.filter((spot) => !spot.away);
    for (const { x, y, rx, ry } of inside)
      held.push({ left: x - rx, top: y - ry, right: x + rx, bottom: y + ry });
    const placed: Rect[] = [];
    const clear = (rect: Rect, others: ReadonlyArray<Rect>) =>
      others.every(
        (other) =>
          rect.right <= other.left ||
          rect.left >= other.right ||
          rect.bottom <= other.top ||
          rect.top >= other.bottom,
      );
    const free = (rect: Rect) =>
      rect.left >= box.left &&
      rect.top >= box.top &&
      rect.right <= width - box.right &&
      rect.bottom <= height - box.bottom &&
      clear(rect, [...taken, ...held]);
    for (const spot of inside) {
      const node = cards.current.get(spot.number);
      if (node === undefined) continue;
      const k = cartoucheSpots(spot, ...measure(sizes.current, spot.number, node)).findIndex(free);
      chosen.current.set(spot.number, k < 0 ? ASIDE : k);
      const rect = cardRect(spot, node)!;
      if (!clear(rect, placed)) {
        chosen.current.set(spot.number, NONE);
        continue;
      }
      placed.push(rect);
      held.push(rect);
    }
    engine.reserveNames(held);
    const away = intel
      ? spots.flatMap((spot) => {
          if (!spot.away) return [];
          const edge = edgeOf(spot, width, height, edgeInsets.current);
          return [
            {
              id: String(spot.number),
              category: 'intel' as const,
              priority: 0,
              x: edge.x,
              y: edge.y,
              reach: Math.hypot(spot.x - width / 2, spot.y - height / 2),
            },
          ];
        })
      : [];
    const composed = cluster(away, width, height);
    setEdges((previous) => (edgeKey(previous) === edgeKey(composed) ? previous : composed));
  }, [engine, size, intel, cardRect, insets]);

  useEffect(() => {
    if (engine === null) return;
    return engine.subscribeRest(place, true);
  }, [engine, place]);
  // A toggle or new contacts cannot wait for the next rest.
  useEffect(place, [place, contacts]);

  useEffect(() => {
    if (engine === null) return;
    engine.onContacts = (spots) => {
      latest.current = spots;
      if ((spots !== null) !== drawn) setDrawn(spots !== null);
      const { width, height } = size.current;
      for (const spot of spots ?? []) {
        const card = cards.current.get(spot.number);
        const badge = badges.current.get(spot.number);
        const thread = threads.current.get(spot.number);
        const shown = !spot.away;
        const rect = shown && card !== undefined ? cardRect(spot, card) : null;
        if (badge) badge.style.visibility = shown ? '' : 'hidden';
        if (card) card.style.visibility = rect === null ? 'hidden' : '';
        thread?.setAttribute('visibility', rect === null ? 'hidden' : 'visible');
        if (badge && shown)
          badge.style.transform = `translate3d(${spot.x + Math.SQRT1_2 * spot.rx}px, ${spot.y - Math.SQRT1_2 * spot.ry}px, 0)`;
        if (rect === null || card === undefined) continue;
        card.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
        const kx = Math.max(rect.left, Math.min(spot.x, rect.right));
        const ky = Math.max(rect.top, Math.min(spot.y, rect.bottom));
        // Where the line from the centre to the cartouche leaves the ellipse.
        const [dx, dy] = [kx - spot.x, ky - spot.y];
        const out = dx === 0 && dy === 0 ? 0 : 1 / Math.hypot(dx / spot.rx, dy / spot.ry);
        thread?.setAttribute('x1', String(spot.x + dx * out));
        thread?.setAttribute('y1', String(spot.y + dy * out));
        thread?.setAttribute('x2', String(kx));
        thread?.setAttribute('y2', String(ky));
      }
      if (spots === null) {
        for (const node of [...cards.current.values(), ...badges.current.values()])
          node.style.visibility = 'hidden';
        for (const node of threads.current.values()) node.setAttribute('visibility', 'hidden');
      }
      for (const group of edges) {
        const token = tokens.current.get(group.id);
        const members = (spots ?? []).filter(
          (spot) =>
            spot.away &&
            group.members.includes(String(spot.number)) &&
            sideOf(...edgePoint(spot, width, height, edgeInsets.current), width, height) ===
              group.side,
        );
        if (token === undefined) continue;
        if (members.length === 0) {
          token.style.display = 'none';
          continue;
        }
        const points = members.map((spot) => edgeOf(spot, width, height, edgeInsets.current));
        const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
        const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
        token.style.display = '';
        token.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        token.style.setProperty('--heading', `${points[0]!.heading}rad`);
      }
    };
    return () => {
      engine.onContacts = () => {};
    };
  }, [engine, edges, size, cardRect, drawn]);

  // Its nodes are born hidden and the next image places them: what makes or changes one asks
  // for that image — the contacts' content, not the list's identity, and the edge's tokens.
  const contentKey = contacts
    .map(({ number, key, troops, seen, latest: hour, name }) =>
      [number, key, troops, seen, hour, name].join(':'),
    )
    .join('|');
  const tokensKey = edgeKey(edges);
  useEffect(() => {
    engine?.invalidate();
  }, [engine, contentKey, tokensKey, compact]);

  const byNumber = new Map(contacts.map((contact) => [String(contact.number), contact]));
  const go = (contact: Contact | undefined, distance?: number) =>
    contact && engine?.journeyTo([], contact.points, 0, distance);

  return (
    <div
      className="contact-marks"
      ref={layer}
      style={
        {
          '--contact-seen': ARC_COLORS.enemyDetected.trace,
          ...(ink === null ? {} : { '--contact-mine': ink }),
        } as CSSProperties
      }
    >
      <svg className="contact-threads" aria-hidden>
        {contacts.map(({ number }) => (
          <line
            key={number}
            visibility="hidden"
            ref={(node) => register(threads.current, number, node)}
          />
        ))}
      </svg>
      {contacts.map((contact) => (
        <button
          key={`card-${contact.number}`}
          type="button"
          className="contact-card"
          style={{ visibility: 'hidden' }}
          ref={(node) => register(cards.current, contact.number, node)}
          onClick={() => go(contact, PIN_APPROACH_DISTANCE)}
        >
          <span className="contact-card-title">
            {fr.contacts.title(contact.number, compact ? contact.city : contact.name)}
          </span>
          <span className="contact-card-line">
            <i className="contact-dot contact-dot--mine" aria-hidden />
            {compact ? contact.troops : fr.contacts.mine(contact.troops)}
            <i className="contact-dot contact-dot--seen" aria-hidden />
            {compact ? contact.seen : fr.contacts.seen(contact.seen)} ·{' '}
            {asClockTime(contact.latest)}
          </span>
        </button>
      ))}
      {contacts.map((contact) => (
        <button
          key={`badge-${contact.number}`}
          type="button"
          className="contact-badge"
          style={{ visibility: 'hidden' }}
          title={contact.name}
          ref={(node) => register(badges.current, contact.number, node)}
          onClick={() => go(contact)}
        >
          {contact.number}
        </button>
      ))}
      {edges.map((group) => (
        <div
          key={group.id}
          className="contact-edge"
          style={{ display: 'none' }}
          ref={(node) => register(tokens.current, group.id, node)}
        >
          <button
            type="button"
            className="contact-badge"
            title={fr.contacts.edge(group.members.join(', '))}
            onClick={() => go(byNumber.get(group.nearest))}
          >
            {group.members.join(' · ')}
          </button>
        </div>
      ))}
      {drawn && contacts.length === 0 && (
        <p
          className="contact-none"
          style={
            compact ? { top: insets.top + 56 } : { top: insets.top + 64, right: insets.right + 20 }
          }
        >
          {fr.contacts.none}
        </p>
      )}
    </div>
  );
}

/** The board's insets widened by the band where the edge tokens stand. */
const bandOf = ({ top, right, bottom, left }: BoardInsets): BoardInsets => {
  const band = EDGE_MARGIN + HALF_BADGE;
  return { top: top + band, right: right + band, bottom: bottom + band, left: left + band };
};

/** What the personal board's band covers of the layer's bottom, as `MapLabels` reads it. */
function matBand(layer: HTMLElement | null): number {
  const pixelsOf = (name: string) =>
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
  const bottom = layer?.getBoundingClientRect().bottom ?? window.innerHeight;
  return Math.max(
    0,
    Math.max(pixelsOf('--mat-rise'), pixelsOf('--board-bottom')) - (window.innerHeight - bottom),
  );
}

/** At the edge of the board left free by the chrome, as `labels.ts` sets the indicators. */
function edgeOf(spot: ContactSpot, width: number, height: number, insets: BoardInsets): EdgePoint {
  const { top, right, bottom, left } = insets;
  const edge = clampToEdge(
    spot.x - left,
    spot.y - top,
    width - left - right,
    height - top - bottom,
  );
  return { ...edge, x: edge.x + left, y: edge.y + top };
}

const edgePoint = (
  spot: ContactSpot,
  width: number,
  height: number,
  insets: BoardInsets,
): [number, number] => {
  const { x, y } = edgeOf(spot, width, height, insets);
  return [x, y];
};

const edgeKey = (groups: ReadonlyArray<IndicatorGroup>): string =>
  groups.map((group) => `${group.id}=${group.members.join(',')}`).join(' ');

function register<K, E>(map: Map<K, E>, key: K, node: E | null): void {
  if (node) map.set(key, node);
  else map.delete(key);
}

const ASIDE = -1;
const NONE = -2;

function measure(
  sizes: Map<number, readonly [number, number]>,
  number: number,
  node: HTMLElement,
): readonly [number, number] {
  const size = [node.offsetWidth, node.offsetHeight] as const;
  sizes.set(number, size);
  return size;
}

/**
 * **Where a contact's cartouche may stand** (maquette C), in the order tried: by the circle's
 * shoulders, above and below it, then further out at its sides; the rectangles are `width` ×
 * `height`.
 */
function cartoucheSpots({ x, y, rx, ry }: ContactSpot, width: number, height: number): Rect[] {
  const [ax, ay] = [rx * 0.72, ry * 0.72];
  const at = (left: number, top: number) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
  });
  return [
    at(x + ax + 6, y - ay - height / 2),
    at(x - ax - 6 - width, y - ay - height / 2),
    at(x + ax + 6, y + ay - height / 2),
    at(x - ax - 6 - width, y + ay - height / 2),
    at(x - width / 2, y - ry - height - 8),
    at(x - width / 2, y + ry + 8),
    at(x + rx + 30, y - height / 2),
    at(x - rx - 30 - width, y - height / 2),
  ];
}
