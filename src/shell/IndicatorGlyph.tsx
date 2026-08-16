import type { CSSProperties, ReactNode } from 'react';
import type { IndicatorCategory } from '@/domain/indicators';
import { Glyph } from './Glyph';

/**
 * The game's pictograms. Port, airfield and barracks mark nothing yet: the projection
 * buildings of ADR 0013 are not implemented. They are declared here so that when the day
 * comes there is only wiring to write, never a drawing to find.
 */
export type PictogramName =
  | 'outpost'
  | 'port'
  | 'airfield'
  | 'barracks'
  | 'construction'
  | 'forces'
  | 'troops'
  | 'production'
  | 'nation'
  | 'replay'
  | 'doctrine'
  | 'intel'
  | 'journal';

/** Two weights per pictogram: stripped for 20 px, detailed for 40 px. */
export type PictogramWeight = 20 | 40;

/**
 * A pictogram is a mask, never an `<img>`: the PNG cuts, the `background-color` carries the
 * ink. Every state stays driven by the `color` already in place — the rail's on/off, the
 * category inks, the critical accent — instead of declining one file per state.
 */
export function Pictogram({
  pictogram,
  weight,
  size,
}: {
  pictogram: PictogramName;
  weight: PictogramWeight;
  size: number;
}) {
  const cut = `url('/pictograms/${pictogram}-${weight}.png')`;
  const mask: CSSProperties = {
    width: size,
    height: size,
    maskImage: cut,
    WebkitMaskImage: cut,
  };
  return <span className="picto" style={mask} aria-hidden />;
}

/**
 * The industry surface's mark. A drawn stroke and not a `Pictogram`, because the eleven
 * pictograms are baked PNG masks and there is no industry plate to bake from — the same
 * reason the buildings bascule and the settings icon are drawn.
 *
 * Two chimneys over a shed: it says *what transforms*, where a foundry or a mine would name
 * one of the ten buildings the window gathers.
 */
export function IndustryGlyph({ size = 19 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M2.5 17.5v-7l4 2.5v-2.5l4 2.5v-2.5l4 2.5V17.5z" />
      <path d="M15.5 17.5v-13h2.5v13" />
      <path d="M2.5 17.5h15" />
    </Glyph>
  );
}

/**
 * One mark per category, and the same everywhere: what the rail lights is what parks at the
 * screen edge. Two drawings for the same category would make the toggle a guessing game.
 *
 * Categories of things carry their pictogram; the two movement marks stay drawn strokes,
 * whose arrow says a direction where a pictogram would only say a nature.
 */
export function IndicatorGlyph({
  category,
  size = 19,
}: {
  category: IndicatorCategory;
  size?: number;
}) {
  const mark = MARK[category];
  return 'pictogram' in mark ? (
    <Pictogram pictogram={mark.pictogram} weight={20} size={size} />
  ) : (
    <Glyph size={size}>{mark.stroke}</Glyph>
  );
}

type Mark = { readonly pictogram: PictogramName } | { readonly stroke: ReactNode };

const MARK: Readonly<Record<IndicatorCategory, Mark>> = {
  /**
   * A drawn stroke, not a pictogram: the fifteen buildings share no silhouette, and picking
   * one of them — the foundry, the port — would say a nature where the bascule speaks of all
   * of them. The roof-and-chimney reads as "what stands", which is exactly the category.
   */
  buildings: {
    stroke: (
      <>
        <path d="M3.5 16.5v-6l4-3 4 3v6" />
        <path d="M11.5 16.5v-4h5v4" />
        <path d="M14 12.5v-3" />
        <path d="M2.5 16.5h15" />
      </>
    ),
  },
  /**
   * A drawn stroke again, and for the mirror reason: the five deposits each have their own
   * silhouette in `ResourceIcon`, and lighting the bascule with one of them — the drop, the
   * grain sack — would promise a filter on that resource. The seam under the ground line says
   * *what lies beneath*, which is the category.
   */
  deposits: {
    stroke: (
      <>
        <path d="M2.5 6.5h15" />
        <path d="M7 13.8 4.4 10.6 7 7.4l2.6 3.2z" />
        <path d="M14 16 12 13.4l2-2.6 2 2.6z" />
      </>
    ),
  },
  outposts: { pictogram: 'outpost' },
  constructions: { pictogram: 'construction' },
  forces: { pictogram: 'forces' },
  'my-movements': {
    stroke: (
      <>
        <path d="M3.5 10h11" />
        <path d="M11 6.2 14.8 10 11 13.8" />
      </>
    ),
  },
  inbound: {
    stroke: (
      <>
        <path d="M16.5 10h-8" />
        <path d="M12.2 6.2 8.5 10l3.7 3.8" />
        <circle cx="4.6" cy="10" r="1.7" />
      </>
    ),
  },
  intel: { pictogram: 'intel' },
};
