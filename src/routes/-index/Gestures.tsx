import type { CSSProperties } from 'react';
import { fr } from '@/i18n/fr';
import { useCoarsePointer } from '@/shell/viewport';
import { FILM_CUTS, type FilmCut } from './film';

/** The rose's two verbs on the target, as the game words them. */
const PETALS = [fr.drop.verbs.attack, fr.drop.verbs.inland];

/** A desk the demo scene shows: the stocks are staged, their words are the game's. */
const BINS = [
  { key: 'food', amount: 382, note: fr.resourceBand.drySoonShort(10), dry: true },
  { key: 'steel', amount: 400, note: fr.resourceBand.full, dry: false },
  { key: 'coal', amount: 398, note: fr.ledger.perHour(-3), dry: false },
] as const;

/** Where the pile stands in the capture and where its order goes, as a share of the tile. Read
 *  off the two captures (`gestes-16x9.jpg`, `gestes-9x16.jpg`), which frame the same contact. */
const SPOTS = {
  wide: { px: 47.2, py: 48.7, tx: 82.2, ty: 36.6, aspect: '1440 / 900' },
  tall: { px: 43.6, py: 47.4, tx: 61.5, ty: 66.6, aspect: '390 / 470' },
} as const satisfies Record<FilmCut, object>;

/**
 * **Les gestes d'aujourd'hui, en quatre vignettes** : lever, poser (la rose), envoyer (le
 * tampon), le sous-main. Chacune rejoue son geste sur la même capture du jeu ; en mouvement
 * « réduites » ou « coupées », c'est le geste fini qui reste, image fixe (`.lp[data-still]`).
 */
export function Gestures({ cut }: { cut: FilmCut }) {
  const finger = useCoarsePointer();
  const g = fr.front.gestures;
  const spot = SPOTS[cut];
  const style = {
    '--px': `${spot.px}%`,
    '--py': `${spot.py}%`,
    '--tx': `${spot.tx}%`,
    '--ty': `${spot.ty}%`,
    aspectRatio: spot.aspect,
  } as CSSProperties;
  const route = `M${spot.px},${spot.py} Q${(spot.px + spot.tx) / 2},${Math.min(spot.py, spot.ty) - 12} ${spot.tx},${spot.ty}`;

  const tiles = [
    {
      key: 'lift',
      copy: { title: g.lift.title, text: g.lift.text(finger) },
      overlay: (
        <>
          <span className="lp-g lp-g-pile" />
          <span className="lp-g lp-g-tag">{fr.drop.pieces(5)}</span>
        </>
      ),
    },
    {
      key: 'place',
      copy: { title: g.place.title, text: g.place.text(fr.errors.DISEMBARK_AT_SEA()) },
      overlay: (
        <span className="lp-g lp-g-rose">
          {PETALS.map((petal, index) => (
            <span key={petal} className={`lp-petal lp-petal-${index}`}>
              {petal}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'send',
      copy: g.send,
      overlay: (
        <>
          <svg className="lp-g lp-g-route" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={route} vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="lp-g lp-g-stamp">{fr.aim.submit}</span>
        </>
      ),
    },
    {
      key: 'desk',
      copy: g.desk,
      overlay: (
        <span className="lp-g lp-g-desk">
          {BINS.map((bin) => (
            <span key={bin.key}>
              <i>{fr.resources[bin.key]}</i>
              <b>{bin.amount}</b>
              <em className={bin.dry ? 'lp-refus' : undefined}>{bin.note}</em>
            </span>
          ))}
        </span>
      ),
    },
  ];

  return (
    <ol className="lp-gestures" aria-label={g.label}>
      {tiles.map((tile, index) => (
        <li key={tile.key}>
          <div className="lp-tile" style={style}>
            <img src={FILM_CUTS[cut].gestures} alt="" loading="lazy" />
            <div aria-hidden>{tile.overlay}</div>
          </div>
          <span className="lp-kicker">{`${index + 1} / ${tiles.length}`}</span>
          <h3>{tile.copy.title}</h3>
          <p>{tile.copy.text}</p>
        </li>
      ))}
    </ol>
  );
}
