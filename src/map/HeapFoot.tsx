import { heapReadingOf, type HeapMark } from '@/domain/heap-reading';
import { asSpan } from '@/domain/duration';
import { fr } from '@/i18n/fr';
import { resourceColor } from '@/emblems/resource-color';
import { useClock } from '@/shell/clock';
import type { CSSProperties } from 'react';

/**
 * **Le tas au pied de mon exploitation** (ADR 0041, #548, maquette « Au pied ») : une pile de jetons,
 * le chiffre sur le plafond, une jauge ; plein, le tampon et depuis quand. Une fondation au niveau 1
 * n'entasse rien : elle dit qu'elle rapporte seule.
 *
 * Le nombre et le « depuis » suivent la minute dans le nœud lui-même : ils ne touchent ni le moteur
 * ni ses images (CLAUDE.md, carte à la demande), la pose de l'étiquette reste celle de la carte.
 */
export function HeapFoot({ heap }: { heap: HeapMark }) {
  const now = useClock(60_000);
  if (heap.cap === 0) {
    return heap.foundation === null ? null : (
      <span className="heap-foot heap-foot--alone heap-foot--foundation">
        <Seal />
        {fr.heap.aloneAtOne(heap.foundation.alonePerHour, heap.resource)}
      </span>
    );
  }
  const reading = heapReadingOf(heap, now);
  return (
    <span
      className={`heap-foot${reading.full ? ' heap-foot--full' : ''}${heap.foundation === null ? '' : ' heap-foot--foundation'}`}
      title={fr.heap.title(heap.resource, reading.amount, reading.cap)}
      style={
        {
          '--heap-ink': resourceColor(heap.resource),
          '--heap-ink-paper': resourceColor(heap.resource, true),
        } as CSSProperties
      }
    >
      <span className="heap-stack" aria-hidden>
        {Array.from({ length: reading.stack }, (_, rank) => (
          <i key={rank} style={{ bottom: `${rank * 5}px` }} />
        ))}
      </span>
      <span className="heap-tag">
        {heap.foundation !== null && <Seal />}
        <b>
          {reading.amount}
          <small> / {reading.cap}</small>
        </b>
        <span className="heap-gauge">
          <i style={{ width: `${reading.share * 100}%` }} />
        </span>
        {heap.foundation !== null && (
          <small className="heap-alone">{fr.heap.aloneBeside(heap.foundation.alonePerHour)}</small>
        )}
      </span>
      {reading.full && reading.stoppedSince !== null && (
        <span className="heap-stamp">
          {fr.heap.full} {fr.heap.since(asSpan(Math.max(0, now - reading.stoppedSince) / 60_000))}
        </span>
      )}
    </span>
  );
}

/** Le sceau de fondation : à l'exploitation dont le niveau 1 verse seul au stock. */
function Seal() {
  return (
    <span className="label-seal" title={fr.heap.sealTitle}>
      {fr.heap.seal}
    </span>
  );
}
