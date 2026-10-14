import { useEffect, useState, type ReactNode } from 'react';
import { INK_BY_NATION, isNation } from '@/domain/nations';

/**
 * **La carte gravée du hors-saison** (choix 3 de la note du 14/10) : un SVG des côtes réelles
 * (Natural Earth 50m, `public/engraved-map.json`, x = lon + 180, y = 90 − lat), lignes d'eau
 * tracées à largeur fixe à l'écran. Pas le moteur : légère au téléphone, et le moteur arrive au
 * lancement. Les tracés sont posés une fois dans la page (`EngravedDefs`) et chaque carte les
 * reprend par `<use>`.
 */
type Geo = { readonly land: string; readonly nations: Readonly<Record<string, string>> };

let pending: Promise<Geo> | null = null;
let loaded: Geo | null = null;

function useGeo(): Geo | null {
  const [geo, setGeo] = useState(loaded);
  useEffect(() => {
    if (loaded !== null) return;
    pending ??= fetch('/engraved-map.json').then((answer) => answer.json() as Promise<Geo>);
    let alive = true;
    void pending
      .then((answer) => {
        loaded = answer;
        if (alive) setGeo(answer);
      })
      .catch(() => {
        pending = null;
      });
    return () => {
      alive = false;
    };
  }, []);
  return geo;
}

export function EngravedDefs() {
  const geo = useGeo();
  if (geo === null) return null;
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <path id="os-land" d={geo.land} vectorEffect="non-scaling-stroke" />
        {Object.entries(geo.nations).map(([nation, d]) => (
          <path key={nation} id={`os-n-${nation}`} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </defs>
    </svg>
  );
}

const LIGHT = {
  sea: '#cfdbd2',
  seaInk: '#2c5063',
  land: '#d9caa6',
  coast: '#2a2118',
  grat: 'rgba(44,80,99,.16)',
  label: 'rgba(44,80,99,.72)',
};
const DARK = {
  sea: '#191309',
  seaInk: '#8e7c5c',
  land: '#231b11',
  coast: '#5d4c33',
  grat: 'rgba(142,124,92,.1)',
  label: 'rgba(142,124,92,.3)',
};

/** [ouest, sud, est, nord] en degrés ; l'est peut passer 180 (le Pacifique). */
export type Box = readonly [number, number, number, number];

export const WORLD_BOX: Box = [-170, -56, 190, 76];

type Frame = { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number };

function frameOf(box: Box, pad: number, flat: boolean) {
  const [w, s, e, n] = box;
  const sy = flat ? 1 : Math.min(1.45, 1 / Math.cos((((s + n) / 2) * Math.PI) / 180));
  const dx = (e - w) * pad;
  const dy = (n - s) * pad;
  const frame: Frame = {
    x0: w + 180 - dx,
    x1: e + 180 + dx,
    y0: (90 - n - dy) * sy,
    y1: (90 - s + dy) * sy,
  };
  return { frame, sy, dx, dy };
}

/** Où tombe un point lon/lat dans une carte de `width × height` pixels (ajustée, `meet`). */
export function projectOn(
  box: Box,
  size: { readonly width: number; readonly height: number },
  lon: number,
  lat: number,
  { pad = 0.05, flat = false }: { pad?: number; flat?: boolean } = {},
): readonly [number, number] {
  const { frame, sy } = frameOf(box, pad, flat);
  const vw = frame.x1 - frame.x0;
  const vh = frame.y1 - frame.y0;
  const k = Math.min(size.width / vw, size.height / vh);
  let x = lon + 180;
  if (box[2] > 180 && x < frame.x0) x += 360;
  return [
    (size.width - vw * k) / 2 + (x - frame.x0) * k,
    (size.height - vh * k) / 2 + ((90 - lat) * sy - frame.y0) * k,
  ];
}

export function EngravedMap({
  box,
  px = 800,
  pad = 0.05,
  flat = false,
  dark = false,
  fit = 'meet',
  thumb = false,
  rings = [16, 11.5, 7.5, 4.2, 1.9],
  gratStep = 10,
  frame,
  veil = 0.5,
  nations = {},
  labels = [],
  labelPx = 15,
  children,
}: {
  box: Box;
  /** La largeur rendue, à peu près : les lignes d'eau et les libellés s'y règlent. */
  px?: number;
  pad?: number;
  flat?: boolean;
  dark?: boolean;
  fit?: 'meet' | 'slice';
  thumb?: boolean;
  rings?: ReadonlyArray<number>;
  gratStep?: number;
  frame?: Box | undefined;
  veil?: number;
  nations?: Readonly<Record<string, { readonly mine?: boolean }>>;
  labels?: ReadonlyArray<readonly [string, number, number, number]>;
  labelPx?: number;
  children?: ReactNode;
}) {
  const palette = dark ? DARK : LIGHT;
  const { frame: view, sy, dx, dy } = frameOf(box, pad, flat);
  const [w, s, e, n] = box;
  const upp = (view.x1 - view.x0) / px;
  const shifts = e - w > 300 ? [-360, 0, 360] : e > 180 ? [0, 360] : [0];
  const uses = (key: string, props: Record<string, string | number>) =>
    shifts.map((shift) => <use key={`${key}${shift}`} href="#os-land" x={shift} {...props} />);
  const meridians: number[] = [];
  for (let at = Math.ceil((w - dx) / gratStep) * gratStep; at <= e + dx; at += gratStep) {
    meridians.push(at);
  }
  const parallels: number[] = [];
  for (let at = Math.ceil((s - dy) / gratStep) * gratStep; at <= n + dy; at += gratStep) {
    parallels.push(at);
  }
  const frameRect =
    frame === undefined
      ? null
      : `M${frame[0] + 180},${90 - frame[3]}H${frame[2] + 180}V${90 - frame[1]}H${frame[0] + 180}Z`;

  return (
    <svg
      className="map"
      viewBox={`${view.x0} ${view.y0} ${view.x1 - view.x0} ${view.y1 - view.y0}`}
      preserveAspectRatio={`xMidYMid ${fit}`}
      aria-hidden
    >
      <rect
        x={view.x0 - 400}
        y={view.y0 - 400}
        width={view.x1 - view.x0 + 800}
        height={view.y1 - view.y0 + 800}
        fill={palette.sea}
      />
      <g transform={`scale(1 ${sy})`}>
        <g stroke={palette.grat} strokeWidth={1}>
          {meridians.map((at) => (
            <line
              key={`m${at}`}
              x1={at + 180}
              y1={90 - n - dy}
              x2={at + 180}
              y2={90 - s + dy}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {parallels.map((at) => (
            <line
              key={`p${at}`}
              x1={view.x0}
              y1={90 - at}
              x2={view.x1}
              y2={90 - at}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        {rings.map((d, i) => (
          <g key={d}>
            {uses(`a${d}`, {
              fill: 'none',
              stroke: palette.seaInk,
              strokeOpacity: (0.13 + (0.09 * (rings.length - i)) / rings.length).toFixed(2),
              strokeWidth: 2 * d + 1,
              strokeLinejoin: 'round',
            })}
            {uses(`b${d}`, {
              fill: 'none',
              stroke: palette.sea,
              strokeWidth: 2 * d - 0.3,
              strokeLinejoin: 'round',
            })}
          </g>
        ))}
        {uses('land', {
          fill: palette.land,
          stroke: palette.coast,
          strokeWidth: thumb ? 0.8 : 1.15,
        })}
        {Object.entries(nations).map(([nation, { mine = false }]) =>
          shifts.map((shift) => (
            <use
              key={`${nation}${shift}`}
              href={`#os-n-${nation}`}
              x={shift}
              fill={isNation(nation) ? INK_BY_NATION[nation] : palette.coast}
              fillOpacity={mine ? 0.78 : 0.55}
              stroke={palette.coast}
              strokeWidth={mine ? 1.6 : 1}
            />
          )),
        )}
        {frameRect !== null && (
          <>
            <path
              d={`M${view.x0 - 400},${view.y0 / sy - 400}H${view.x1 + 400}V${view.y1 / sy + 400}H${view.x0 - 400}Z ${frameRect}`}
              fillRule="evenodd"
              fill="#e4d8bd"
              fillOpacity={veil}
            />
            <path
              d={frameRect}
              fill="none"
              stroke={palette.coast}
              strokeWidth={thumb ? 1.4 : 1.6}
              strokeDasharray={thumb ? '4 3' : '7 4'}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </g>
      {labels.map(([text, lon, lat, k]) => (
        <text
          key={text}
          x={lon + 180}
          y={(90 - lat) * sy}
          textAnchor="middle"
          fontFamily="Bodoni Moda, Georgia, serif"
          fontStyle="italic"
          fontSize={labelPx * k * upp}
          letterSpacing={2 * upp}
          fill={palette.label}
        >
          {text}
        </text>
      ))}
      {children}
    </svg>
  );
}

/** La rose fixe du coin de la carte du salon. */
export function CompassRoseMark() {
  const points = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const length = k % 2 ? 26 : 52;
    const width = k % 2 ? 5 : 8;
    const tip = `M${Math.cos(a) * length},${Math.sin(a) * length}`;
    const left = `L${Math.cos(a + Math.PI / 2) * width},${Math.sin(a + Math.PI / 2) * width}L0,0Z`;
    const right = `L${Math.cos(a - Math.PI / 2) * width},${Math.sin(a - Math.PI / 2) * width}L0,0Z`;
    return (
      <g key={k}>
        <path d={tip + left} fill="currentColor" opacity={0.85} />
        <path d={tip + right} fill="none" stroke="currentColor" strokeWidth={1} />
      </g>
    );
  });
  return (
    <svg className="rose" viewBox="-60 -70 120 130" aria-hidden>
      <circle r={44} fill="none" stroke="currentColor" strokeWidth={1.4} />
      <circle r={39} fill="none" stroke="currentColor" strokeWidth={0.8} />
      {points}
      <text
        y={-56}
        textAnchor="middle"
        fontFamily="Bodoni Moda, serif"
        fontWeight={700}
        fontSize={16}
        fill="currentColor"
      >
        N
      </text>
    </svg>
  );
}
