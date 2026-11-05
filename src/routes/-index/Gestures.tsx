import type { CSSProperties } from 'react';
import { fr } from '@/i18n/fr';
import { FILM_CUTS, type FilmCut } from './film';

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
  const g = fr.front.gestures;
  const spot = SPOTS[cut];
  const style = {
    '--px': `${spot.px}%`,
    '--py': `${spot.py}%`,
    '--tx': `${spot.tx}%`,
    '--ty': `${spot.ty}%`,
    aspectRatio: spot.aspect,
  } as CSSProperties;
  const x0 = (spot.px / 100) * 100;
  const y0 = (spot.py / 100) * 100;
  const x1 = (spot.tx / 100) * 100;
  const y1 = (spot.ty / 100) * 100;
  const route = `M${x0},${y0} Q${(x0 + x1) / 2},${Math.min(y0, y1) - 12} ${x1},${y1}`;

  const tiles = [
    {
      key: 'lift',
      copy: g.lift,
      overlay: (
        <>
          <span className="lp-g lp-g-pile" />
          <span className="lp-g lp-g-tag">{g.lift.tag}</span>
        </>
      ),
    },
    {
      key: 'place',
      copy: g.place,
      overlay: (
        <span className="lp-g lp-g-rose">
          {g.place.petals.map((petal, index) => (
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
          <span className="lp-g lp-g-stamp">{g.send.stamp}</span>
        </>
      ),
    },
    {
      key: 'desk',
      copy: g.desk,
      overlay: (
        <span className="lp-g lp-g-desk">
          {g.desk.bins.map((bin) => (
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
