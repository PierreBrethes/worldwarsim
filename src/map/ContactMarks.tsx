// Le moteur de carte est une classe impérative à qui on assigne `.onContacts` : React Compiler
// lit ça comme une mutation interdite (voir EdgeIndicators).
'use no memo';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { asClockTime } from '@/domain/duration';
import type { Contact } from '@/domain/contacts';
import { clampToEdge, cluster, sideOf, type IndicatorGroup } from '@/domain/indicators';
import type { Rect } from '@/domain/poster-placement';
import { fr } from '@/i18n/fr';
import { useBoardInsets, useCoarsePointer } from '@/shell/viewport';
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
  /** The spot each cartouche took at the last rest, by number; `-1`, none was free. */
  const chosen = useRef(new Map<number, number>());
  const cards = useRef(new Map<number, HTMLElement>());
  /** Each cartouche's size, measured at rest: a frame does not read the layout. */
  const sizes = useRef(new Map<number, readonly [number, number]>());
  const badges = useRef(new Map<number, HTMLElement>());
  const threads = useRef(new Map<number, SVGLineElement>());
  const tokens = useRef(new Map<string, HTMLElement>());
  const [edges, setEdges] = useState<ReadonlyArray<IndicatorGroup>>([]);
  const [drawn, setDrawn] = useState(false);

  const cardRect = useCallback(
    (spot: ContactSpot, node: HTMLElement): Rect => {
      const [w, h] = sizes.current.get(spot.number) ?? measure(sizes.current, spot.number, node);
      const spots = cartoucheSpots(spot.x, spot.y, spot.radius, w, h);
      const k = chosen.current.get(spot.number) ?? 0;
      if (k >= 0) return spots[k]!;
      const left = Math.max(6, Math.min(size.current.width - w - 6, spot.x + spot.radius + 6));
      const top = spot.y - h / 2;
      return { left, top, right: left + w, bottom: top + h };
    },
    [size],
  );

  const place = useCallback(() => {
    if (engine === null) return;
    const spots = latest.current ?? [];
    const { width, height } = size.current;
    const taken: Rect[] = engine.markRects();
    const held: Rect[] = [];
    const inside = spots.filter((spot) => !spot.away);
    for (const { x, y, radius } of inside)
      held.push({ left: x - radius, top: y - radius, right: x + radius, bottom: y + radius });
    const free = (rect: Rect) =>
      rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= width &&
      rect.bottom <= height &&
      [...taken, ...held].every(
        (other) =>
          rect.right <= other.left ||
          rect.left >= other.right ||
          rect.bottom <= other.top ||
          rect.top >= other.bottom,
      );
    for (const spot of inside) {
      const node = cards.current.get(spot.number);
      if (node === undefined) continue;
      const k = cartoucheSpots(
        spot.x,
        spot.y,
        spot.radius,
        ...measure(sizes.current, spot.number, node),
      ).findIndex(free);
      chosen.current.set(spot.number, k);
      held.push(cardRect(spot, node));
    }
    engine.reserveNames(held);
    const away = intel
      ? spots.flatMap((spot) => {
          if (!spot.away) return [];
          const edge = clampToEdge(spot.x, spot.y, width, height);
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
  }, [engine, size, intel, cardRect]);

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
        for (const node of [card, badge]) if (node) node.style.visibility = shown ? '' : 'hidden';
        thread?.setAttribute('visibility', shown ? 'visible' : 'hidden');
        if (!shown || card === undefined) continue;
        const rect = cardRect(spot, card);
        card.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
        const corner = Math.SQRT1_2 * spot.radius;
        if (badge)
          badge.style.transform = `translate3d(${spot.x + corner}px, ${spot.y - corner}px, 0)`;
        const kx = Math.max(rect.left, Math.min(spot.x, rect.right));
        const ky = Math.max(rect.top, Math.min(spot.y, rect.bottom));
        const angle = Math.atan2(ky - spot.y, kx - spot.x);
        thread?.setAttribute('x1', String(spot.x + Math.cos(angle) * spot.radius));
        thread?.setAttribute('y1', String(spot.y + Math.sin(angle) * spot.radius));
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
            sideOf(...edgePoint(spot, width, height), width, height) === group.side,
        );
        if (token === undefined) continue;
        if (members.length === 0) {
          token.style.display = 'none';
          continue;
        }
        const points = members.map((spot) => clampToEdge(spot.x, spot.y, width, height));
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

const edgePoint = (spot: ContactSpot, width: number, height: number): [number, number] => {
  const { x, y } = clampToEdge(spot.x, spot.y, width, height);
  return [x, y];
};

const edgeKey = (groups: ReadonlyArray<IndicatorGroup>): string =>
  groups.map((group) => `${group.id}=${group.members.join(',')}`).join(' ');

function register<K, E>(map: Map<K, E>, key: K, node: E | null): void {
  if (node) map.set(key, node);
  else map.delete(key);
}

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
 * shoulders, above and below it, then further out at its sides. `R` is the circle's radius on
 * screen; the rectangles are `width` × `height`.
 */
function cartoucheSpots(x: number, y: number, R: number, width: number, height: number): Rect[] {
  const a = R * 0.72;
  const at = (left: number, top: number) => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
  });
  return [
    at(x + a + 6, y - a - height / 2),
    at(x - a - 6 - width, y - a - height / 2),
    at(x + a + 6, y + a - height / 2),
    at(x - a - 6 - width, y + a - height / 2),
    at(x - width / 2, y - R - height - 8),
    at(x - width / 2, y + R + 8),
    at(x + R + 30, y - height / 2),
    at(x - R - 30 - width, y - height / 2),
  ];
}
