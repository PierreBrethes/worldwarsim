import { pastilleShares } from '@/domain/harvest';
import type { LonLat } from '@/domain/geo';
import type { ResourceKey } from '@/domain/ids';
import type { InkBurst } from '@/domain/ink-bursts';
import { asClockTime } from '@/domain/duration';
import type { MapMotion } from '@/domain/map-motion';
import { fr } from '@/i18n/fr';
import { resourceColor } from '@/emblems/resource-color';

export type Point = { readonly x: number; readonly y: number };

/**
 * **Où les choses se tiennent à l'écran**, offert par celui qui les dessine : le plateau
 * personnel dit où est un bac, la carte où est un lieu et comment y presser un tampon. Les
 * échanges (payer, charger, livrer, recharger) ne se connaissent pas entre eux : ils volent d'un
 * endroit à l'autre par ce registre, sans que la carte importe le plateau ni l'inverse.
 */
type Spots = {
  bin: (resource: ResourceKey) => Point | null;
  onMap: (at: LonLat) => Point | null;
  stamp: (burst: InkBurst) => void;
};
const bound: Partial<Spots> = {};

/** Offers some spots; the returned function takes back only the ones still this caller's. */
export function bindSpots(part: Partial<Spots>): () => void {
  Object.assign(bound, part);
  return () => {
    for (const key of Object.keys(part) as Array<keyof Spots>)
      if (bound[key] === part[key]) delete bound[key];
  };
}

export const binPoint = (resource: ResourceKey): Point | null => bound.bin?.(resource) ?? null;
export const mapPoint = (at: LonLat): Point | null => bound.onMap?.(at) ?? null;
const pressStamp = (burst: InkBurst): void => bound.stamp?.(burst);

export const centreOf = (node: Element): Point => {
  const box = node.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

const SIZE_PX = 18;

/**
 * **Une pastille qui vole** : un disque à la couleur de la ressource, d'un point de l'écran à un
 * autre, en arc. Elle montre que ça coule, jamais combien. Réduites, elle naît et s'éteint sur
 * `rest` sans trajet (la récolte seule s'en sert ; les échanges, eux, ne volent pas).
 */
export function flyPastille(
  layer: HTMLElement,
  resource: ResourceKey,
  { from, to, rest = to, fade = true }: { from: Point; to: Point; rest?: Point; fade?: boolean },
  motion: MapMotion,
  { delay }: { delay: number },
): Promise<void> {
  const pastille = document.createElement('span');
  pastille.className = 'harvest-pastille';
  pastille.style.setProperty('--pastille', resourceColor(resource, false));
  pastille.style.setProperty('--pastille-rim', resourceColor(resource, true));
  layer.append(pastille);
  const half = SIZE_PX / 2;
  const place = (point: Point, scale = 1) =>
    `translate(${point.x - half}px, ${point.y - half}px) scale(${scale})`;
  const arc = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 40 };
  const frames =
    motion === 'reduced'
      ? [
          { transform: place(rest), opacity: 0 },
          { transform: place(rest), opacity: 1, offset: 0.4 },
          { transform: place(rest), opacity: 0 },
        ]
      : [
          { transform: place(from), opacity: 1 },
          { transform: place(arc, 1.25), offset: 0.5 },
          { transform: place(to), opacity: fade ? 0 : 1 },
        ];
  return pastille
    .animate(frames, {
      duration: motion === 'reduced' ? 420 : 640,
      delay,
      easing: 'cubic-bezier(.35,.1,.3,1)',
      fill: 'both',
    })
    .finished.then(
      () => pastille.remove(),
      () => pastille.remove(),
    );
}

/** One batch of exchanges: what flies, from where to where. */
export type Flow = {
  readonly resource: ResourceKey;
  readonly amount: number;
  readonly from: Point;
  readonly to: Point;
};

export const flightLayer = (): HTMLElement => {
  const layer = document.createElement('div');
  layer.className = 'pointer-events-none fixed inset-0 z-[var(--z-notice)]';
  document.body.append(layer);
  return layer;
};

/**
 * **Les pastilles d'un échange confirmé** — et rien d'autre : « actives » seulement. Réduites, le
 * tampon seul (posé par l'appelant) ; coupées, rien. `onLand` dit chaque part arrivée, pour que
 * le compte du bac d'arrivée suive le vol.
 */
export function flyFlows(
  flows: ReadonlyArray<Flow>,
  motion: MapMotion,
  onLand: (flow: Flow, share: number) => void = () => {},
): Promise<void> {
  if (motion !== 'full' || flows.length === 0) return Promise.resolve();
  const layer = flightLayer();
  const flights = flows.flatMap((flow, rank) =>
    pastilleShares(flow.amount).map((share, index) =>
      flyPastille(layer, flow.resource, flow, motion, { delay: rank * 110 + index * 140 }).then(
        () => onLand(flow, share),
      ),
    ),
  );
  return Promise.all(flights).then(() => layer.remove());
}

/** **Payer** : de leur bac (ou du bandeau) vers l'endroit de la carte où la dépense s'est faite. */
function payFlows(
  cost: Readonly<Partial<Record<ResourceKey, number>>>,
  at: LonLat,
): ReadonlyArray<Flow> {
  const to = mapPoint(at);
  if (to === null) return [];
  return (Object.entries(cost) as Array<[ResourceKey, number]>).flatMap(([resource, amount]) => {
    const from = binPoint(resource);
    return amount > 0 && from !== null ? [{ resource, amount, from, to }] : [];
  });
}

/** **La pulsation d'une troupe rechargée** : un anneau qui s'ouvre sur elle et s'éteint. */
export function pulseAt(point: Point, motion: MapMotion): void {
  if (motion !== 'full') return;
  const ring = document.createElement('span');
  ring.className = 'recharge-pulse';
  const layer = flightLayer();
  layer.append(ring);
  const place = (scale: number) =>
    `translate(${point.x - 22}px, ${point.y - 22}px) scale(${scale})`;
  const done = () => layer.remove();
  ring
    .animate(
      [
        { transform: place(0.4), opacity: 0.9 },
        { transform: place(1.5), opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out', fill: 'both' },
    )
    .finished.then(done, done);
}

/** **Le tampon d'un échange confirmé**, posé à la place de la carte où il s'est fait. */
export function stampWord(
  kind: 'built' | 'delivered',
  word: keyof typeof fr.stamps.exchange,
  at: LonLat,
): void {
  pressStamp({
    kind,
    at,
    words: { word: fr.stamps.exchange[word], hour: asClockTime(Date.now()) },
  });
}

/** **Une dépense confirmée** par le serveur : ses pastilles du bac à la carte. Le tampon BÂTI ou
 *  ÉLEVÉ viendra à l'achèvement du chantier, pas ici : c'est ici qu'on paie. */
export function spent(
  cost: Readonly<Partial<Record<ResourceKey, number>>>,
  at: LonLat,
  motion: MapMotion,
): void {
  void flyFlows(payFlows(cost, at), motion);
}
