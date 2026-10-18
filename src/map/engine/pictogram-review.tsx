import { createRoot } from 'react-dom/client';
import { DEPOSITS, type RegionType } from '@/domain/ids';
import { DepositMark } from '@/emblems/DepositMark';
import { ResourceIcon, resourceColor } from '@/emblems/ResourceIcon';
import { YIELD_OF } from '@/domain/economy';
import { fr } from '@/i18n/fr';
import '@/styles/index.css';
import { INK_BY_NATION } from '@/domain/nations';
import { lit, nationShades, PALETTE, penOn } from './palette';
import { mulberry } from '@/domain/mulberry';
import { terrainCluster } from './terrain';

/**
 * **The dev review page** (`/pictograms.html`): every terrain drawing and every deposit mark,
 * large (several variants of each, seeds 1 to 12) and at the size the board gives them, on the bare sheet and on a dark held ground —
 * where a drawing is judged before it reaches the map. Never shipped.
 */
const TYPES = Object.keys(fr.regionTypes) as ReadonlyArray<RegionType>;
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
/** France's home sheet as the lamp renders it, and the pen the board draws on it. */
const FRANCE = INK_BY_NATION.france;
const DARK_GROUND = lit(nationShades(FRANCE).sheet);
const DARK_PEN = penOn(nationShades(FRANCE).sheet, FRANCE);

function Cluster({ type, seed, scale }: { type: RegionType; seed: number; scale: number }) {
  const strokes = terrainCluster(type, mulberry(seed));
  const xs = strokes.flat().map(([x]) => x);
  const ys = strokes.flat().map(([, y]) => y);
  const [minX, minY] = [Math.min(...xs) - 2, Math.min(...ys) - 2];
  const [w, h] = [Math.max(...xs) + 2 - minX, Math.max(...ys) + 2 - minY];
  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      width={w * scale}
      height={h * scale}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4 / scale}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    >
      {strokes.map((stroke, i) => (
        <polyline key={i} points={stroke.map(([x, y]) => `${x},${y}`).join(' ')} />
      ))}
    </svg>
  );
}

function Sheet({
  ground,
  ink,
  children,
}: {
  ground: string;
  ink: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: ground,
        color: ink,
        padding: 12,
        display: 'flex',
        gap: 14,
        flexWrap: 'wrap',
        alignItems: 'end',
      }}
    >
      {children}
    </div>
  );
}

function Review() {
  return (
    <main
      style={{
        padding: 16,
        display: 'grid',
        gap: 24,
        background: '#171208',
        color: PALETTE.paper,
        minHeight: '100vh',
      }}
    >
      <h1 style={{ margin: 0, font: '700 22px Georgia, serif' }}>
        Pictogrammes — terrain et gisements
      </h1>
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, font: '700 16px Georgia, serif' }}>
          Terrain (survol d’une région)
        </h2>
        {TYPES.map((type) => (
          <article
            key={type}
            data-type={type}
            style={{
              display: 'grid',
              gridTemplateColumns: '90px 1.2fr 1fr 1fr',
              gap: 8,
              alignItems: 'stretch',
            }}
          >
            <strong
              style={{
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: 12,
                alignSelf: 'center',
              }}
            >
              {fr.regionTypes[type]}
            </strong>
            <Sheet ground={PALETTE.neutralLand} ink={PALETTE.border}>
              {SEEDS.slice(0, 4).map((seed) => (
                <Cluster key={seed} type={type} seed={seed} scale={3} />
              ))}
            </Sheet>
            <Sheet ground={PALETTE.neutralLand} ink={PALETTE.border}>
              {SEEDS.map((seed) => (
                <Cluster key={seed} type={type} seed={seed} scale={1} />
              ))}
            </Sheet>
            <Sheet ground={DARK_GROUND} ink={DARK_PEN}>
              {SEEDS.map((seed) => (
                <Cluster key={seed} type={type} seed={seed} scale={1} />
              ))}
            </Sheet>
          </article>
        ))}
      </section>
      <section style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, font: '700 16px Georgia, serif' }}>
          Gisements — gravure (et l’ancienne silhouette)
        </h2>
        {DEPOSITS.map((deposit) => (
          <article
            key={deposit}
            data-deposit={deposit}
            style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 8 }}
          >
            <strong
              style={{
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontSize: 12,
                alignSelf: 'center',
              }}
            >
              {fr.deposits[deposit]}
            </strong>
            <Sheet ground={PALETTE.neutralLand} ink={resourceColor(YIELD_OF[deposit], true)}>
              <DepositMark resource={deposit} size={96} />
              <DepositMark resource={deposit} size={30} />
              <span className="label-deposit">
                <DepositMark resource={deposit} />
              </span>
            </Sheet>
            <Sheet ground={PALETTE.neutralLand} ink={resourceColor(YIELD_OF[deposit], true)}>
              <ResourceIcon resource={YIELD_OF[deposit]} size={96} />
              <span className="label-deposit">
                <ResourceIcon resource={YIELD_OF[deposit]} size={15} />
              </span>
            </Sheet>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('review')!).render(<Review />);
