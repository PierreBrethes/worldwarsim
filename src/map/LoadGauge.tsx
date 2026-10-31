import type { Ref } from 'react';
import { SUPPLY_KEYS, type SupplyLoad } from '@/domain/logistics';
import { resourceColor } from '@/emblems/resource-color';
import { fr } from '@/i18n/fr';
import type { TokenHint } from './TokenDrag';

/** The gauge is this tall, so the hand knows where its bands lie before it is measured. */
export const GAUGE_H = 124;
export const GAUGE_W = 300;

export type GaugeLayout = { readonly left: number; readonly top: number; readonly width: number };

/**
 * **La jauge de bord** (#319, maquette `quantite-exacte/jauge.html`) : la charge entière du
 * transport en une voie, ce qui est à bord par ressource, puis la charge sous la main, hachurée
 * au-delà de ce que la source tient. Elle ne prend pas le pointeur : `TokenDrag` la lit à la main.
 */
export function LoadGauge({
  reading,
  resource,
  layout,
  fine,
  railRef,
}: {
  reading: TokenHint;
  resource: keyof SupplyLoad;
  layout: GaugeLayout;
  /** La main est au-dessus : le pas est plus fin. */
  fine: boolean;
  railRef: Ref<HTMLDivElement>;
}) {
  const { held, capacity, amount, max, load } = reading;
  const pct = (n: number) => `${(n / capacity) * 100}%`;
  let at = 0;
  return (
    <div
      role="status"
      className="load-gauge paper-grain"
      style={{ left: layout.left, top: layout.top, width: layout.width, height: GAUGE_H }}
    >
      <div className="load-gauge-title">
        <b>{reading.title}</b>
        <span className={fine ? 'load-gauge-fine load-gauge-fine--on' : 'load-gauge-fine'}>
          {fine ? fr.logistics.gaugeFineOn : fr.logistics.gaugeFine}
        </span>
      </div>
      <div className="load-gauge-read">
        <b>{fr.logistics.gaugeLoad(amount)}</b>
        <span>{fr.logistics.gaugeAfter(held + amount, capacity)}</span>
      </div>
      <div className="load-gauge-note">
        {amount === 0 ? fr.logistics.gaugeZero : (reading.word ?? '')}
      </div>
      <div ref={railRef} className="load-gauge-rail">
        {SUPPLY_KEYS.map((key) => {
          const left = at;
          at += load[key];
          return load[key] > 0 ? (
            <i
              key={key}
              className="load-gauge-seg"
              style={{
                left: pct(left),
                width: pct(load[key]),
                background: resourceColor(key, true),
              }}
            />
          ) : null;
        })}
        <i
          className="load-gauge-seg load-gauge-new"
          style={{
            left: pct(held),
            width: pct(amount),
            backgroundColor: resourceColor(resource, true),
          }}
        />
        {held + max < capacity && (
          <i className="load-gauge-beyond" style={{ left: pct(held + max) }} />
        )}
        {Array.from({ length: 9 }, (_, k) => (
          <i key={k} className="load-gauge-tick" style={{ left: `${(k + 1) * 10}%` }} />
        ))}
        <i className="load-gauge-cursor" style={{ left: pct(held + amount) }} />
      </div>
    </div>
  );
}
