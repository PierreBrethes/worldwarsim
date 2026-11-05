import { frameOf } from '@/domain/final-edition-read';
import { nationImage } from '@/emblems/Flag';
import { fr, nationLabel } from '@/i18n/fr';
import { SEA_INK, inkOf, type EndMap } from './end-map';
import { finestWords, type FinalEdition } from './words';

const said = fr.finalEdition;
const UNE_WIDTH = 1080;
const UNE_HEIGHT = 1350;
/** Le canvas ne lit pas les variables CSS : les jetons se relisent sur la page, au dessin. */
const tokenOf = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const M = 64;

const flagImage = (nation: string): Promise<HTMLImageElement | null> => {
  const css = nationImage(nation);
  if (css === null) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = css.slice(5, -2);
  });
};

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, max: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (c.measureText(next).width > max && line !== '') {
      c.fillText(line, x, y);
      y += 44;
      line = word;
    } else line = next;
  }
  c.fillText(line, x, y);
}

/**
 * **La une en image, 1080 × 1350** (#455) : le titre, la manchette, le chapeau, la carte de la fin
 * et le classement, dessinés au canvas depuis l'archive ; le pied porte la ligne du joueur, ou la
 * phrase neutre. Les chemins de la carte sont ceux de la page (`EndMap`).
 */
export async function drawUne(
  canvas: HTMLCanvasElement,
  edition: FinalEdition,
  map: EndMap,
  withMine: boolean,
): Promise<void> {
  const c = canvas.getContext('2d');
  if (c === null) return;
  const INK = tokenOf('--ink');
  const RED = tokenOf('--critical');
  await document.fonts?.ready;
  canvas.width = UNE_WIDTH;
  canvas.height = UNE_HEIGHT;
  const W = UNE_WIDTH;
  const mine = edition.nations.find((page) => page.mine) ?? null;
  c.fillStyle = tokenOf('--paper');
  c.fillRect(0, 0, W, UNE_HEIGHT);
  c.fillStyle = INK;
  const rule = (y: number, height = 1) => c.fillRect(M, y, W - 2 * M, height);
  /** Les petites capitales de la maquette sont espacées ; le reste du canvas ne l'est pas. */
  const spaced = (px: number, draw: () => void) => {
    c.letterSpacing = `${px}px`;
    draw();
    c.letterSpacing = '0px';
  };

  c.font = '600 19px "Archivo Narrow"';
  spaced(4, () => {
    c.fillText(
      `${said.meta(edition.code).toUpperCase()} · ${said.une.players(edition.nations.length)}`,
      M,
      78,
    );
    c.textAlign = 'right';
    c.fillText(said.span(edition.launchedAt, edition.concludedAt).toUpperCase(), W - M, 78);
  });
  rule(94, 3);
  /** Le titre comme à l'écran : l'article petit et penché, le mot en grand. */
  c.textAlign = 'left';
  c.font = '800 112px "Bodoni Moda"';
  const word = c.measureText(fr.masthead.word).width;
  c.font = 'italic 500 40px "Bodoni Moda"';
  const article = c.measureText(`${fr.masthead.article} `).width;
  const left = W / 2 - (word + article) / 2;
  c.fillText(fr.masthead.article, left, 168);
  c.font = '800 112px "Bodoni Moda"';
  c.fillText(fr.masthead.word, left + article, 196);
  c.textAlign = 'center';
  rule(222);
  rule(227, 3);
  c.font = '700 22px "Archivo Narrow"';
  c.fillStyle = RED;
  spaced(8, () => c.fillText(said.stamp.toUpperCase(), W / 2, 264));
  c.fillStyle = INK;
  const headline = said
    .headline(edition.verdict.reason, edition.verdict.winnerNation)
    .toUpperCase();
  let size = 104;
  do c.font = `800 ${(size -= 2)}px "Bodoni Moda"`;
  while (c.measureText(headline).width > W - 2 * M && size > 40);
  c.fillText(headline, W / 2, 372);
  c.font = 'italic 400 33px "Source Serif 4"';
  c.fillStyle = tokenOf('--ink-quiet');
  wrap(
    c,
    said.deck({
      reason: edition.verdict.reason,
      points: edition.points
        .filter((point) => point.hands.at(-1)?.nation === edition.verdict.winnerNation)
        .map((point) => point.key),
      at: edition.concludedAt,
    }),
    W / 2,
    432,
    W - 2 * M - 40,
  );

  /** La carte, au cadre de la région de jeu. */
  const [west, north, east, south] = frameOf(edition.playableRegion);
  const box = { x: M, y: 540, w: W - 2 * M, h: 400 };
  const k = Math.min(box.w / (east - west), box.h / (south - north));
  const ox = box.x + (box.w - k * (east - west)) / 2 - k * west;
  const oy = box.y + (box.h - k * (south - north)) / 2 - k * north;
  c.save();
  c.beginPath();
  c.rect(box.x, box.y, box.w, box.h);
  c.clip();
  c.fillStyle = SEA_INK;
  c.fillRect(box.x, box.y, box.w, box.h);
  c.setTransform(k, 0, 0, k, ox, oy);
  for (const land of map.lands) {
    const path = new Path2D(land.d);
    c.globalAlpha = land.nation === null ? 1 : 0.72;
    c.fillStyle = inkOf(land.nation);
    c.fill(path, 'evenodd');
    c.globalAlpha = 1;
    c.lineWidth = (withMine && land.nation === mine?.nation ? 2.6 : 0.7) / k;
    c.strokeStyle = INK;
    c.stroke(path);
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  for (const point of edition.points) {
    const anchor = map.anchors.get(point.regionId);
    if (anchor === undefined) continue;
    const x = ox + k * anchor[0];
    const y = oy + k * anchor[1];
    c.fillStyle = inkOf(point.hands.at(-1)?.nation ?? null);
    c.fillRect(x - 8, y - 8, 16, 16);
    c.lineWidth = 2.5;
    c.strokeStyle = INK;
    c.strokeRect(x - 8, y - 8, 16, 16);
  }
  c.restore();
  c.lineWidth = 2;
  c.strokeStyle = INK;
  c.strokeRect(box.x, box.y, box.w, box.h);

  /** Le classement, en deux colonnes de quatre. */
  const flags = await Promise.all(edition.nations.map((page) => flagImage(page.nation)));
  const top = 990;
  const column = (W - 2 * M - 40) / 2;
  c.textAlign = 'left';
  c.fillStyle = INK;
  c.font = '700 18px "Archivo Narrow"';
  spaced(5, () => c.fillText(said.une.rankingHead, M, top - 18));
  rule(top - 8, 2);
  edition.nations.forEach((page, index) => {
    const x = M + (index < 4 ? 0 : column + 40);
    const y = top + 22 + (index % 4) * 50;
    c.fillStyle = index === 0 ? RED : INK;
    c.font = '800 34px "Bodoni Moda"';
    c.fillText(String(page.rank), x, y + 26);
    const flag = flags[index];
    if (flag != null) {
      c.filter = 'saturate(.45) sepia(.28) brightness(.88)';
      c.drawImage(flag, x + 44, y + 4, 36, 24);
      c.filter = 'none';
    }
    c.strokeStyle = INK;
    c.lineWidth = 1;
    c.strokeRect(x + 44, y + 4, 36, 24);
    c.fillStyle = INK;
    c.font = `${withMine && page.mine ? 800 : 700} 28px "Bodoni Moda"`;
    c.fillText(nationLabel(page.nation), x + 94, y + 26);
    c.font = '500 25px "IBM Plex Mono"';
    c.textAlign = 'right';
    c.fillText(said.percent(page.figures.territory), x + column, y + 26);
    c.textAlign = 'left';
    if (page.exit !== null) {
      c.fillStyle = RED;
      c.font = '700 14px "Bodoni Moda"';
      spaced(3, () => c.fillText(said.outcome[page.exit!.kind].toUpperCase(), x + 230, y + 24));
    }
    c.fillStyle = INK;
    c.globalAlpha = 0.18;
    c.fillRect(x, y + 42, column, 1);
    c.globalAlpha = 1;
  });

  /** Le pied : la ligne de qui partage, ou rien de lui. */
  if (withMine && mine !== null) {
    const y = UNE_HEIGHT - 102;
    c.fillStyle = INK;
    c.fillRect(0, y, W, 102);
    c.fillStyle = tokenOf('--paper');
    c.font = '600 18px "Archivo Narrow"';
    spaced(4, () => c.fillText(said.une.mineHead(mine.nation, mine.nickname), M, y + 38));
    c.font = 'italic 500 29px "Bodoni Moda"';
    c.fillText(
      `${fr.press.ordinal(mine.rank)} · ${said.percent(mine.figures.territory)} · ${finestWords(mine, edition, map)?.title ?? said.finest.none}`,
      M,
      y + 78,
      W - 2 * M,
    );
  } else {
    c.font = 'italic 400 22px "Source Serif 4"';
    c.fillStyle = tokenOf('--ink-soft');
    c.textAlign = 'center';
    c.fillText(said.une.neutralFoot(), W / 2, UNE_HEIGHT - 52);
  }
}
