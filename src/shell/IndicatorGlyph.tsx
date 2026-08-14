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
  | 'journal'
  | 'supply'
  | 'steel'
  | 'manpower';

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
  const cut = `url('/pictos/${pictogram}-${weight}.png')`;
  const mask: CSSProperties = {
    width: size,
    height: size,
    maskImage: cut,
    WebkitMaskImage: cut,
  };
  return <span className="picto" style={mask} aria-hidden />;
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
