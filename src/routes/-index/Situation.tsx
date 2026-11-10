import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { fr } from '@/i18n/fr';
import type { LonLat } from '@/domain/geo';
import { CAPITAL_BY_NATION, INK_BY_NATION, NATIONS, typeInk, type Nation } from '@/domain/nations';
import { FIRST_SEVEN, STRATEGIC_POINTS, type StrategicPointKey } from '@/domain/strategic-points';
import { EngravedMap, plotterOf, useEngravedLand, type Box } from '@/emblems/EngravedMap';

/** L'écran étroit lit l'Europe : le monde entier, à sa largeur, ne serait qu'un bandeau. */
const EUROPE_BOX: Box = [-28, 26, 52, 72];

/**
 * Le monde au format de son cadre : depuis le 80ᵉ nord et le milieu du Pacifique, vers l'est
 * jusqu'au Japon au moins et jusqu'au tour complet si le cadre est large, et vers le sud aussi
 * loin que le cadre est haut. C'est le sud qui s'ajuste : Narvik reste, et le coin sud-ouest est
 * à la mer — c'est là que la une pose son coupon.
 */
const worldBoxOf = (size: { readonly width: number; readonly height: number }): Box => {
  const [north, west] = [80, -172];
  const aspect = size.width / Math.max(1, size.height);
  const reach = Math.min(360, Math.max(TO_JAPAN, TALL * aspect));
  return [west, north - reach / aspect, west + reach, north];
};
/** Degrés de longitude du bord ouest à la mer du Japon passée, et de latitude du 80ᵉ nord au 60ᵉ sud. */
const TO_JAPAN = 343;
const TALL = 140;

/** Les mers, écrites où le coupon et les ordres les laissent lire : le nom vient de la table du
 *  salon, la place est celle de cette carte-ci. */
const [PACIFIC, ATLANTIC, INDIAN] = fr.table.worldSeas.map(([name]) => name);
const WORLD_SEAS = [
  [PACIFIC, -146, 34, 1],
  [ATLANTIC, -40, 27, 1],
  [INDIAN, 76, -24, 1],
] as ReadonlyArray<readonly [string, number, number, number]>;
const EUROPE_SEAS = fr.table.sheets.europe.seas
  .filter(([, , , weight]) => weight >= 1)
  .concat([[fr.table.sheets.europe.seas[2]![0], 19, 33.4, 0.8]]);

/** Un ordre par point : d'où il part, où il va. Sept points, huit nations — il en manquera un. */
const ORDERS = [
  ['germany', 'narvik'],
  ['uk', 'halifax'],
  ['usa', 'lisbon'],
  ['france', 'tangier'],
  ['italy', 'istanbul'],
  ['japan', 'hongKong'],
  ['china', 'rangoon'],
] as const satisfies ReadonlyArray<readonly [Nation, StrategicPointKey]>;

/** De quel côté du cercle son nom s'écrit : là où la mer est libre. */
const NAME_SIDE: Readonly<Record<StrategicPointKey, 1 | -1>> = {
  tangier: 1,
  istanbul: 1,
  rangoon: -1,
  hongKong: 1,
  halifax: 1,
  narvik: 1,
  lisbon: -1,
  baku: 1,
  dakar: -1,
  singapore: 1,
};

const INKED = Object.fromEntries(NATIONS.map((nation) => [nation, {}]));

/**
 * **La carte de la situation** : la une d'un journal de 1940 portait une carte et ses flèches.
 * Celle-ci est le jeu — les huit nations à leur encre, les sept points stratégiques cerclés, et
 * un ordre qui part vers chacun. Les ordres se tracent une fois, quand la terre est là ; en
 * mouvement « réduites » ou « coupées » ils sont déjà tracés (`landing.css`).
 */
export function Situation({ world }: { world: boolean }) {
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => ({
    width: Math.min(window.innerWidth, 1320),
    height: 520,
  }));
  useLayoutEffect(() => {
    const node = frame.current;
    if (node === null) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const box = world ? worldBoxOf(size) : EUROPE_BOX;
  const plot = plotterOf(box, { flat: world });
  const [west, north] = plot(box[0], box[3]);
  const [east, south] = plot(box[2], box[1]);
  const span = { width: east - west, height: south - north };
  /** Pixels par unité du dessin : la carte remplit son cadre (`slice`), le plus grand des deux. */
  const scale = Math.max(size.width / span.width, size.height / span.height);
  const unit = 1 / scale;
  const drawn = useEngravedLand();

  return (
    <div className="lp-map" ref={frame} data-drawn={drawn ? '' : undefined}>
      <EngravedMap
        box={box}
        px={span.width * scale}
        pad={0}
        flat={world}
        fit="slice"
        gratStep={world ? 15 : 10}
        rings={world ? [9, 5.5, 2.6] : [15, 10.5, 6.5, 3]}
        nations={INKED}
        labels={world ? WORLD_SEAS : EUROPE_SEAS}
        labelPx={world ? 15 : 13}
      >
        <defs>
          {ORDERS.map(([nation, point], index) => (
            <mask
              key={point}
              id={`lp-reveal-${point}`}
              maskUnits="userSpaceOnUse"
              x={west - 360}
              y={north - 90}
              width={span.width + 720}
              height={span.height + 180}
            >
              <path
                className="lp-order-reveal"
                style={rankOf(index)}
                d={routeOf(plot, nation, point).d}
                pathLength={1}
                fill="none"
                stroke="white"
                strokeWidth={8 * unit}
              />
            </mask>
          ))}
        </defs>
        {ORDERS.map(([nation, point], index) => {
          const route = routeOf(plot, nation, point);
          const ink = typeInk(INK_BY_NATION[nation]);
          const [x, y] = spot(plot, CAPITAL_BY_NATION[nation]);
          return (
            <g key={point} className="lp-order" style={rankOf(index)}>
              <path
                d={route.d}
                mask={`url(#lp-reveal-${point})`}
                fill="none"
                stroke={ink}
                strokeWidth={1.9 * unit}
                strokeDasharray={`${5.5 * unit} ${4 * unit}`}
              />
              <path
                className="lp-order-head"
                d={headOf(route, 6.5 * unit)}
                fill={ink}
                stroke="none"
              />
              <rect
                x={x - 2.5 * unit}
                y={y - 2.5 * unit}
                width={5 * unit}
                height={5 * unit}
                fill={ink}
              />
            </g>
          );
        })}
        {FIRST_SEVEN.map((point) => {
          const [x, y] = spot(plot, STRATEGIC_POINTS[point]);
          const side = NAME_SIDE[point];
          return (
            <g key={point} className="lp-point">
              <circle cx={x} cy={y} r={5.5 * unit} strokeWidth={1.3 * unit} />
              <circle cx={x} cy={y} r={2 * unit} className="lp-point-eye" />
              <text
                x={x + side * 9 * unit}
                y={y + 3.2 * unit}
                textAnchor={side > 0 ? 'start' : 'end'}
                fontSize={9.5 * unit}
                letterSpacing={1.3 * unit}
                strokeWidth={3 * unit}
              >
                {fr.points.names[point].toUpperCase()}
              </text>
            </g>
          );
        })}
      </EngravedMap>
    </div>
  );
}

/** Le rang d'un ordre, que la feuille de style lit pour les faire partir l'un après l'autre. */
const rankOf = (rank: number) => ({ '--rank': rank }) as CSSProperties;

type Route = { readonly d: string; readonly end: Point; readonly bend: Point };
type Point = readonly [number, number];
type Plotter = (lon: number, lat: number) => Point;

const spot = (plot: Plotter, [lon, lat]: LonLat): Point => plot(lon, lat);

/** Où l'ordre s'arrête sur sa courbe : avant le cercle du point, pour que la flèche le désigne. */
const SHORT = 0.9;

/**
 * La route d'un ordre, de la capitale au point : un arc tendu vers le nord, comme les routes du
 * plateau se bombent sur la carte.
 */
function routeOf(plot: Plotter, nation: Nation, point: StrategicPointKey): Route {
  const [x0, y0] = spot(plot, CAPITAL_BY_NATION[nation]);
  const [x1, y1] = spot(plot, STRATEGIC_POINTS[point]);
  const length = Math.hypot(x1 - x0, y1 - y0);
  /** La normale qui monte : l'arc passe au nord de sa corde. */
  const [nx, ny] = [(y1 - y0) / length, -(x1 - x0) / length];
  const up = ny > 0 ? -1 : 1;
  const bend: Point = [
    (x0 + x1) / 2 + nx * up * length * 0.22,
    (y0 + y1) / 2 + ny * up * length * 0.22,
  ];
  const at = (t: number): Point => [
    (1 - t) ** 2 * x0 + 2 * (1 - t) * t * bend[0] + t ** 2 * x1,
    (1 - t) ** 2 * y0 + 2 * (1 - t) * t * bend[1] + t ** 2 * y1,
  ];
  /** La courbe coupée à `SHORT` (de Casteljau) : même tracé, arrêté avant le point. */
  const end = at(SHORT);
  const cut: Point = [x0 + (bend[0] - x0) * SHORT, y0 + (bend[1] - y0) * SHORT];
  return { d: `M${x0},${y0}Q${cut[0]},${cut[1]} ${end[0]},${end[1]}`, end, bend: cut };
}

/** La pointe de flèche, au bout de la route et dans son axe. */
function headOf(route: Route, size: number): string {
  const [x, y] = route.end;
  const angle = Math.atan2(y - route.bend[1], x - route.bend[0]);
  const corner = (turn: number, reach: number): string =>
    `${x + Math.cos(angle + turn) * reach},${y + Math.sin(angle + turn) * reach}`;
  return `M${corner(0, size)}L${corner(2.5, size * 0.75)}L${corner(-2.5, size * 0.75)}Z`;
}
