import type { ScreenBox } from '@/domain/label-groups';
import {
  placeNames,
  SEA_BUDGET,
  seaLines,
  seaSpots,
  type NameCandidate,
} from '@/domain/place-names';
import type { NameSpots } from './engine';

/**
 * **Le décor de l'atlas, à la plume** (#440, variante A de `carte-lisible`) : capitale en point
 * cerclé, grande ville en point plein, noms de villes en romain, de fleuves en italique bleu,
 * tous détourés de papier ; les mers (#457) en capitales italiques espacées, bleu de mer, sans
 * liseré. One canvas under the labels, repainted with them; it keeps its ink at
 * night, as the labels do.
 */
const CITY_INK = '#3a2c1e';
const RIVER_INK = '#3f6c8c';
const SEA_INK = '#4f7a92';
const PAPER = '#f1e8d2';
/** The maquette's budget: forty names at the desk, fifteen on a phone. */
const BUDGET = { desk: 40, touch: 15 };
const CAPITAL_FONT = '600 13px';
const CITY_FONT = '500 12px';
const RIVER_FONT = 'italic 500 12px';
const SEA_FONT = 'italic 500 12px';
const SEA_SPACING_PX = 3;
/** The name floats over the river, on the paper side. */
const RIVER_OFFSET_PX = 7;
const TEXT_HEIGHT = 14;

type Drawn =
  | { kind: 'city'; x: number; y: number; capital: boolean; name: string; box: ScreenBox }
  | { kind: 'river'; x: number; y: number; angle: number; name: string; box: ScreenBox }
  | { kind: 'sea'; lines: string[]; box: ScreenBox };

export class NameSheet {
  private readonly context: CanvasRenderingContext2D | null;
  private readonly widths = new Map<string, number>();
  private family = 'serif';

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext('2d');
    const display = getComputedStyle(canvas).getPropertyValue('--font-display').trim();
    if (display !== '') this.family = display;
  }

  /** Measured once a name and a font, once the font has come: a width taken on the fallback
   *  font would stay wrong. */
  private widthOf(font: string, text: string): number {
    const key = `${font}|${text}`;
    let width = this.widths.get(key);
    if (width === undefined && this.context !== null) {
      this.context.font = `${font} ${this.family}`;
      width = this.context.measureText(text).width;
      if (document.fonts.status === 'loaded') this.widths.set(key, width);
    }
    return width ?? 0;
  }

  paint(
    spots: NameSpots,
    occupied: readonly ScreenBox[],
    size: { width: number; height: number },
    touch: boolean,
  ): void {
    const context = this.context;
    if (context === null) return;
    const ratio = devicePixelRatio;
    const [width, height] = [Math.round(size.width * ratio), Math.round(size.height * ratio)];
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size.width, size.height);

    const drawn: Drawn[][] = [];
    const candidates: NameCandidate[] = [];
    const city = ({ x, y, name, capital }: NameSpots['cities'][number]) => {
      const w = this.widthOf(capital ? CAPITAL_FONT : CITY_FONT, name);
      const h = TEXT_HEIGHT;
      const box = (left: number, top: number) => ({ left, top, right: left + w, bottom: top + h });
      const spots = [
        box(x + 6, y - h / 2),
        box(x - 6 - w, y - h / 2),
        box(x - w / 2, y - h - 6),
        box(x - w / 2, y + 5),
      ];
      // Its point under a piece, the name stands off a little further, as on the maquette.
      const aside = [24, 44, 64].flatMap((off) => [
        box(x - w / 2, y - h - off),
        box(x - w / 2, y + off),
        box(x + off, y - h / 2),
        box(x - off - w, y - h / 2),
      ]);
      candidates.push({
        anchor: { left: x - 4, top: y - 4, right: x + 4, bottom: y + 4 },
        spots,
        aside,
      });
      drawn.push(
        [...spots, ...aside].map((each) => ({ kind: 'city', x, y, capital, name, box: each })),
      );
    };
    for (const each of spots.cities) if (each.capital) city(each);
    for (const { name, spots: along } of spots.rivers) {
      const w = this.widthOf(RIVER_FONT, name) + name.length * 1.2;
      const fits = along.filter(({ length }) => length > w + 12);
      if (fits.length === 0) continue;
      const placed = fits.map(({ x, y, angle }) => {
        // Never upside down.
        const turn = Math.abs(angle) > Math.PI / 2 ? angle - Math.sign(angle) * Math.PI : angle;
        const [cx, cy] = [
          x + Math.sin(turn) * RIVER_OFFSET_PX,
          y - Math.cos(turn) * RIVER_OFFSET_PX,
        ];
        const [hx, hy] = [
          (Math.abs(Math.cos(turn)) * w + Math.abs(Math.sin(turn)) * TEXT_HEIGHT) / 2,
          (Math.abs(Math.sin(turn)) * w + Math.abs(Math.cos(turn)) * TEXT_HEIGHT) / 2,
        ];
        return {
          box: { left: cx - hx, top: cy - hy, right: cx + hx, bottom: cy + hy },
          draw: {
            kind: 'river' as const,
            x: cx,
            y: cy,
            angle: turn,
            name,
            box: { left: cx - hx, top: cy - hy, right: cx + hx, bottom: cy + hy },
          },
        };
      });
      candidates.push({ anchor: null, spots: placed.map(({ box }) => box) });
      drawn.push(placed.map(({ draw }) => draw));
    }
    for (const each of spots.cities) if (!each.capital) city(each);

    const chosen = placeNames(
      candidates,
      [...occupied, ...spots.pins],
      touch ? BUDGET.touch : BUDGET.desk,
    );

    // The seas after the cities, on a budget of their own, around what the cities took.
    const seaDrawn: Drawn[][] = [];
    const seaCandidates: NameCandidate[] = [];
    for (const { name, spots: inside } of spots.seas) {
      const lines = seaLines(name.toUpperCase());
      const w = Math.max(
        ...lines.map((line) => this.widthOf(SEA_FONT, line) + line.length * SEA_SPACING_PX),
      );
      const boxes = seaSpots(inside, { width: w, height: lines.length * TEXT_HEIGHT });
      if (boxes.length === 0) continue;
      seaCandidates.push({ anchor: null, spots: boxes });
      seaDrawn.push(boxes.map((box) => ({ kind: 'sea', lines, box })));
    }
    const seas = placeNames(
      seaCandidates,
      [
        ...occupied,
        ...spots.pins,
        ...chosen.flatMap(({ index, spot, point }) => [
          drawn[index]![spot]!.box,
          ...(point ? [candidates[index]!.anchor!] : []),
        ]),
      ],
      touch ? SEA_BUDGET.touch : SEA_BUDGET.desk,
    );
    context.lineJoin = 'round';
    context.strokeStyle = PAPER;
    context.lineWidth = 3;
    for (const { index, spot, point } of chosen) {
      const name = drawn[index]![spot]!;
      if (name.kind === 'sea') continue;
      if (name.kind === 'city') {
        if (point) dot(context, name.x, name.y, name.capital);
        context.font = `${name.capital ? CAPITAL_FONT : CITY_FONT} ${this.family}`;
        context.textAlign = 'left';
        context.textBaseline = 'middle';
        const at = [name.box.left, (name.box.top + name.box.bottom) / 2] as const;
        context.strokeText(name.name, ...at);
        context.fillStyle = CITY_INK;
        context.fillText(name.name, ...at);
      } else {
        context.save();
        context.translate(name.x, name.y);
        context.rotate(name.angle);
        context.font = `${RIVER_FONT} ${this.family}`;
        context.letterSpacing = '1.2px';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.strokeText(name.name, 0, 0);
        context.fillStyle = RIVER_INK;
        context.fillText(name.name, 0, 0);
        context.restore();
      }
    }
    context.font = `${SEA_FONT} ${this.family}`;
    context.letterSpacing = `${SEA_SPACING_PX}px`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = SEA_INK;
    for (const { index, spot } of seas) {
      const name = seaDrawn[index]![spot]!;
      if (name.kind !== 'sea') continue;
      const { box, lines } = name;
      const x = (box.left + box.right) / 2;
      lines.forEach((line, k) => context.fillText(line, x, box.top + (k + 0.5) * TEXT_HEIGHT));
    }
    context.letterSpacing = '0px';
  }
}

/** The maquette's symbols: a ringed point for a capital, a full one for a city. */
function dot(context: CanvasRenderingContext2D, x: number, y: number, capital: boolean): void {
  context.save();
  context.fillStyle = capital ? PAPER : CITY_INK;
  context.strokeStyle = CITY_INK;
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(x, y, capital ? 4.2 : 2.5, 0, 2 * Math.PI);
  context.fill();
  if (capital) {
    context.stroke();
    context.fillStyle = CITY_INK;
    context.beginPath();
    context.arc(x, y, 1.9, 0, 2 * Math.PI);
    context.fill();
  }
  context.restore();
}
