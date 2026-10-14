import type { LonLat } from '@/domain/geo';
import type { Nation } from '@/domain/ids';
import { INK_BY_NATION } from '@/domain/nations';
import { KM_PER_UNIT, projectLonLat } from '@/domain/routing';
import type { OutlineSample } from '@/domain/world';
import { countryLabel, fr } from '@/i18n/fr';
import { nationShades, PALETTE } from '@/map/engine/palette';

/** `public/europe-sheet.json`, baked by `scripts/generate-europe-sheet.mjs`. */
export type EuropeSheet = {
  readonly box: {
    readonly x0: number;
    readonly x1: number;
    readonly y0: number;
    readonly y1: number;
  };
  readonly sphere: { minX: number; maxX: number; minY: number; maxY: number };
  readonly outline: ReadonlyArray<OutlineSample>;
  readonly countries: ReadonlyArray<{
    readonly a: string;
    readonly p: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  }>;
};

/** The belligerents of the page, washed in their nation's ink. */
export const PLAYING: ReadonlyMap<string, Nation> = new Map([
  ['FRA', 'france'],
  ['GBR', 'uk'],
  ['DEU', 'germany'],
  ['ITA', 'italy'],
  ['RUS', 'ussr'],
]);
/** Neutral ground a belligerent has surveyed: engraved in that nation's faded ink. */
const SURVEYED: ReadonlyMap<string, Nation> = new Map([
  ['NLD', 'germany'],
  ['LUX', 'germany'],
  ['AUT', 'germany'],
  ['CZE', 'germany'],
  ['POL', 'ussr'],
  ['DNK', 'uk'],
  ['IRL', 'uk'],
]);

const ENGRAVED_LABELS: ReadonlyArray<readonly [string, LonLat, number, number, number?]> = [
  ['FRA', [1.6, 46.4], 0.95, 0.42],
  ['DEU', [11.2, 51.6], 0.7, 0.32],
  ['GBR', [-1.6, 52.6], 0.5, 0.22],
  ['ITA', [11.8, 43.6], 0.6, 0.3, 0.85],
  ['ESP', [-3.7, 40.42], 0.7, 0.34],
  ['RUS', [34.8, 52.4], 1.15, 0.6],
  ['POL', [21, 52.23], 0.45, 0.22],
  ['TUR', [32.86, 39.93], 0.55, 0.3],
];
const SEA_LABELS: ReadonlyArray<
  readonly [keyof typeof fr.front.sheet.seas, LonLat, number, number, number]
> = [
  ['atlantic', [-16, 44], 0.75, 0.2, -1.2],
  ['mediterranean', [19, 37], 0.8, 0.24, 0],
  ['northSea', [3.4, 55.6], 0.55, 0.16, 0],
  ['channel', [-3.3, 49.6], 0.32, 0.1, -0.12],
  ['blackSea', [34.5, 43.5], 0.55, 0.18, 0],
];
const ROSE_AT: LonLat = [-15.5, 47];

/** A seeded noise, so the sheet engraves the same grain at every visit. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * **La feuille d'Europe, gravée au canevas** (prototype `landing.html`) : la mer imprimée et ses
 * isobathes, le quadrillage de 10° sur la mer seule, les belligérants au lavis de leur encre
 * (`nationShades`), les pays relevés gravés, le reste au crayon, une rose des vents et un
 * cartouche. Décor pur : la page ne joue aucune partie.
 */
export function engrave(sheet: EuropeSheet, width: number): HTMLCanvasElement {
  const { x0, x1, y0, y1 } = sheet.box;
  const K = width / (x1 - x0);
  const height = Math.round((y1 - y0) * K);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const random = seeded(11);
  const at = (lonLat: LonLat): [number, number] => {
    const [x, y] = projectLonLat(sheet.outline, sheet.sphere, lonLat);
    return [(x - x0) * K, (y - y0) * K];
  };

  const countries = sheet.countries.map((country) => {
    const path = new Path2D();
    for (const ring of country.p) {
      ring.forEach(([x, y], i) =>
        i === 0 ? path.moveTo((x - x0) * K, (y - y0) * K) : path.lineTo((x - x0) * K, (y - y0) * K),
      );
      path.closePath();
    }
    return { adm0: country.a, path };
  });
  const union = (list: typeof countries) => {
    const path = new Path2D();
    for (const country of list) path.addPath(country.path);
    return path;
  };
  const land = union(countries);

  ctx.fillStyle = PALETTE.seaSheet;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(44,80,99,.22)';
  ctx.lineWidth = width / 2400;
  const line = (points: ReadonlyArray<[number, number]>) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  for (let lon = -20; lon <= 60; lon += 10)
    line(Array.from({ length: 57 }, (_, k) => at([lon, 20 + k])));
  for (let lat = 20; lat <= 70; lat += 10)
    line(Array.from({ length: 85 }, (_, k) => at([-22 + k, lat])));

  // Isobaths: the whole coast stroked wide, each stroke covered by the sea inside it.
  ctx.lineJoin = 'round';
  const depths = [1.9, 1.3, 0.85, 0.5, 0.24];
  depths.forEach((depth, k) => {
    ctx.strokeStyle = `rgba(44,80,99,${0.12 + k * 0.05})`;
    ctx.lineWidth = 2 * depth * K;
    ctx.stroke(land);
    ctx.strokeStyle = k >= depths.length - 2 ? '#d8e6e1' : PALETTE.seaSheet;
    ctx.lineWidth = 2 * depth * K - width / 1500;
    ctx.stroke(land);
  });

  for (const { adm0, path } of countries) {
    const playing = PLAYING.get(adm0);
    const surveyed = SURVEYED.get(adm0);
    ctx.fillStyle =
      playing !== undefined
        ? nationShades(INK_BY_NATION[playing]).sheet
        : surveyed !== undefined
          ? nationShades(INK_BY_NATION[surveyed]).surveyed
          : PALETTE.neutralLand;
    ctx.fill(path);
  }

  ctx.save();
  ctx.clip(union(countries.filter((c) => !PLAYING.has(c.adm0) && !SURVEYED.has(c.adm0))));
  ctx.strokeStyle = 'rgba(55,50,44,.09)';
  ctx.lineWidth = width / 3000;
  for (let x = -height; x < width; x += width / 420) {
    ctx.beginPath();
    ctx.moveTo(x, height);
    ctx.lineTo(x + height * 0.7, 0);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(50,46,40,.12)';
  for (let k = 0; k < (width * height) / 900; k++)
    ctx.fillRect(random() * width, random() * height, 1.4, 1.4);
  ctx.restore();

  ctx.save();
  ctx.clip(union(countries.filter((c) => SURVEYED.has(c.adm0))));
  ctx.strokeStyle = 'rgba(60,56,48,.32)';
  ctx.lineWidth = width / 3200;
  for (let y = 0; y < height; y += width / 900) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = width / 1500;
  ctx.globalAlpha = 0.75;
  for (const { path } of countries) ctx.stroke(path);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = width / 1100;
  ctx.stroke(land);

  const spaced = (
    text: string,
    [x, y]: [number, number],
    size: number,
    spacing: number,
    color: string,
    style: string,
    angle = 0,
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `${style} ${size * K}px "Bodoni Moda", Georgia, serif`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    const widths = [...text].map((letter) => ctx.measureText(letter).width);
    let cursor = -(widths.reduce((a, b) => a + b, 0) + spacing * K * (text.length - 1)) / 2;
    [...text].forEach((letter, i) => {
      ctx.fillText(letter, cursor, 0);
      cursor += widths[i]! + spacing * K;
    });
    ctx.restore();
  };
  for (const [adm0, lonLat, size, spacing, angle] of ENGRAVED_LABELS)
    spaced(
      countryLabel(adm0).toLocaleUpperCase('fr-FR'),
      at(lonLat),
      size,
      spacing,
      PLAYING.has(adm0) ? 'rgba(26,20,14,.34)' : 'rgba(26,20,14,.3)',
      '600',
      angle,
    );
  for (const [key, lonLat, size, spacing, angle] of SEA_LABELS)
    spaced(
      fr.front.sheet.seas[key],
      at(lonLat),
      size,
      spacing,
      'rgba(44,80,99,.7)',
      'italic 500',
      angle,
    );

  // The compass rose in the Atlantic.
  ctx.save();
  ctx.translate(...at(ROSE_AT));
  const R = 1.25 * K;
  ctx.strokeStyle = ctx.fillStyle = PALETTE.seaInk;
  ctx.lineWidth = K * 0.035;
  for (const radius of [R, R * 0.88]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const reach = k % 2 ? R * 0.62 : R * 1.2;
    const half = k % 2 ? R * 0.11 : R * 0.17;
    for (const side of [1, -1]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * reach, Math.sin(a) * reach);
      ctx.lineTo(
        Math.cos(a + (side * Math.PI) / 2) * half,
        Math.sin(a + (side * Math.PI) / 2) * half,
      );
      ctx.lineTo(0, 0);
      ctx.closePath();
      if (side === 1) {
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else ctx.stroke();
    }
  }
  ctx.font = `700 ${0.42 * K}px "Bodoni Moda", serif`;
  ctx.textAlign = 'center';
  ctx.fillText(fr.front.sheet.north, 0, -R * 1.42);
  ctx.restore();

  // The cartouche off Ireland, with a scale read off the projection.
  ctx.save();
  ctx.translate(1.4 * K, 13.4 * K);
  const cw = 7.4 * K;
  const ch = 3.2 * K;
  ctx.fillStyle = 'rgba(228,216,189,.94)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = PALETTE.border;
  ctx.lineWidth = K * 0.05;
  ctx.strokeRect(0, 0, cw, ch);
  ctx.lineWidth = K * 0.02;
  ctx.strokeRect(K * 0.12, K * 0.12, cw - K * 0.24, ch - K * 0.24);
  ctx.fillStyle = PALETTE.border;
  ctx.textAlign = 'center';
  ctx.font = `600 ${0.26 * K}px "Archivo Narrow", sans-serif`;
  ctx.fillText(fr.front.sheet.cartouche, cw / 2, K * 0.7);
  ctx.font = `italic 500 ${0.62 * K}px "Bodoni Moda", serif`;
  ctx.fillText(fr.masthead.title, cw / 2, K * 1.55);
  const step = 1.2;
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = k % 2 ? PALETTE.paper : PALETTE.border;
    ctx.fillRect(K * 1.3 + k * K * step, K * 2.0, K * step, K * 0.14);
  }
  ctx.strokeRect(K * 1.3, K * 2.0, K * 4 * step, K * 0.14);
  ctx.fillStyle = PALETTE.border;
  ctx.font = `400 ${0.2 * K}px "IBM Plex Mono", monospace`;
  for (let k = 0; k <= 4; k++) {
    const km = Math.round((k * step * KM_PER_UNIT) / 10) * 10;
    ctx.fillText(k === 4 ? fr.front.sheet.km(km) : String(km), K * 1.3 + k * K * step, K * 2.55);
  }
  ctx.restore();

  const grain = document.createElement('canvas');
  grain.width = grain.height = 256;
  const grainCtx = grain.getContext('2d')!;
  const pixels = grainCtx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const value = 200 + random() * 55;
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = value;
    pixels.data[i * 4 + 3] = 255;
  }
  grainCtx.putImageData(pixels, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = ctx.createPattern(grain, 'repeat')!;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  return canvas;
}

/**
 * **Where the land is, coarsely**: a mask of the same rings, so a hull's lane can be kept at
 * sea. Read in projected units.
 */
export function landMask(sheet: EuropeSheet): (x: number, y: number) => boolean {
  const { x0, x1, y0, y1 } = sheet.box;
  const width = 900;
  const k = width / (x1 - x0);
  const height = Math.round((y1 - y0) * k);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  for (const country of sheet.countries)
    for (const ring of country.p) {
      ring.forEach(([x, y], i) =>
        i === 0 ? ctx.moveTo((x - x0) * k, (y - y0) * k) : ctx.lineTo((x - x0) * k, (y - y0) * k),
      );
      ctx.closePath();
    }
  ctx.fill();
  const data = ctx.getImageData(0, 0, width, height).data;
  return (x, y) => {
    const u = Math.round((x - x0) * k);
    const v = Math.round((y - y0) * k);
    return u >= 0 && v >= 0 && u < width && v < height && data[(v * width + u) * 4 + 3]! > 0;
  };
}
