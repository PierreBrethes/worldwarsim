import { useEffect, useState } from 'react';
import { countryLabel, fr, nationLabel } from '@/i18n/fr';
import { asPressDate } from '@/domain/duration';
import { NATION_BY_ADM0 } from '@/domain/nations';
import type { PlayerView } from '@/domain/player-view';
import { depositOfRegion, loadCoastalRegions, type RegionIdentity } from '@/domain/world';
import { Row, Panel } from './Panel';

/**
 * **Ce que le joueur sait du tenant d'une région**, servi par `control.held` et jamais recalculé
 * ici — c'est la réponse même que la carte peint, donc les deux ne peuvent pas se contredire.
 * Une région vierge n'en a pas de ligne : `null`, et rien ne s'affiche (ADR 0020 §5).
 */
export type RegionHolding = {
  /** Le siège qui tient, tel que la revendication le nomme. `null` est un siège sans nation —
   *  impossible en saison lancée, et `nationLabel` le dit plutôt que de le taire. */
  readonly nation: string | null;
} & ({ readonly state: 'current' } | { readonly state: 'surveyed'; readonly seenAt: number });

/**
 * **What the board is looking at, on one card.** The country and the region used to answer in
 * two stacked boxes, and they were reading the same gesture: the pointer lands on a region, the
 * region belongs to a country, and the player was made to assemble the two himself.
 *
 * **The pointer wins, the selection is what it falls back to.** Hovering shows what is under
 * the pointer and leaving it gives the selected country back. A card that kept a selected
 * France in its head while naming a Romanian region under it would be worse than either box
 * was alone.
 *
 * **The country answers at every zoom, the region only close in.** The region layer fades in
 * under 65 units and the card must not go dark above that: the two hovers are two announcements
 * and the country's is the one that is always there. The region section is shown only when it
 * belongs to the country in the head — the two arrive by different roads, and a card is not the
 * place to discover they disagree.
 *
 * **La géologie répond partout, le relevé non** (décision 65a du 01/09). Le gisement et la côte
 * se lisent sur l'asset : ils sont fixes, identiques pour tout le monde, et ne disent rien de ce
 * qu'un joueur fait — une région roumaine survolée dit son pétrole sans qu'on possède rien.
 * « Tenue par », elle, reste du brouillard : elle vient de `control.held`, elle date, et une
 * région vierge n'en a pas de ligne (ADR 0020 §5).
 *
 * **`holding` est ce que le joueur sait du sol survolé** (ADR 0020 §5) : à jour, le nom franc ;
 * relevé, le nom et sa date en clair. Vierge, il est `null` et la ligne ne paraît pas — inconnue
 * n'est pas neutre.
 *
 * **Deux questions, deux lignes, et c'est le correctif du 31/08** : « avant-poste » dit ce que ce
 * *pays* porte, « tenue par » dit qui tient la *région* sous le curseur. Une seule ligne pour les
 * deux répondait « avant-poste : aucun » sur un sol que la carte peignait depuis un point planté
 * chez le voisin — deux surfaces qui se contredisent sur la même donnée.
 */
export function GroundPanel({
  selected,
  hoveredCountry,
  hoveredRegion,
  holding,
  view,
}: {
  selected: string | null;
  hoveredCountry: string | null;
  hoveredRegion: RegionIdentity | null;
  holding: RegionHolding | null;
  view: PlayerView;
}) {
  const coastal = useCoastalRegions();
  const country = hoveredRegion?.country ?? hoveredCountry ?? selected;
  if (country === null) return null;
  const hovered = hoveredRegion?.country === country ? hoveredRegion : null;

  const outpost = view.me.outposts.find((candidate) => candidate.hostCountry === country);
  const deposit = hovered === null ? null : depositOfRegion(hovered.id);
  // The map designates a country by its `adm0_a3`, opponents by their nation id: the mapping
  // is the seam — comparing the two raw strings never matches (that was a real bug).
  const nation = NATION_BY_ADM0.get(country);
  const opponent =
    nation === undefined ? undefined : view.opponents.find((other) => other.nation === nation);

  return (
    <Panel
      title={opponent ? fr.selectedCountry.enemyTitle : fr.selectedCountry.neutralTitle}
      marker={hoveredCountry === null ? fr.selectedCountry.marker : fr.selectedCountry.hoverMarker}
      position="static"
      width={280}
    >
      <h2 className="font-(family-name:--font-display) text-[22px] font-extrabold tracking-[.02em] text-[var(--ink)] uppercase">
        {countryLabel(country)}
      </h2>

      {opponent ? (
        <>
          <Row
            label={fr.selectedCountry.progression}
            value={`${Math.round(opponent.bar.progress * 100)} %`}
          />
          <Row label={fr.selectedCountry.restWindow} value={opponent.restWindow} />
          <Row label={fr.selectedCountry.lastIntel} value={opponent.lastIntel} />
        </>
      ) : (
        <>
          <Row
            label={fr.selectedCountry.outpost}
            value={
              outpost
                ? `${outpost.isMine ? nationLabel(view.me.nation) : fr.selectedCountry.enemyOwner} — ${fr.specializations[outpost.specialization]}`
                : fr.selectedCountry.none
            }
          />
          {outpost && <Row label={fr.selectedCountry.garrison} value={`${outpost.garrison}`} />}
        </>
      )}

      {hovered && (
        <div className="mt-[10px] border-t border-[var(--ink)] pt-[9px]">
          <span className="eyebrow block">{fr.board.regionLabel}</span>
          <p className="mt-1 text-[13px] text-[var(--ink)]">{hovered.name}</p>
          <p className="text-[11.5px] text-[var(--ink-soft)]">
            {deposit === null
              ? fr.board.regionNoDeposit
              : fr.board.regionDeposit(fr.deposits[deposit])}
          </p>
          {coastal.has(hovered.id) && (
            <p className="text-[11px] text-[var(--ink-quiet)] italic">{fr.board.regionCoastal}</p>
          )}
          {holding !== null && (
            <Row
              label={fr.selectedCountry.heldBy}
              value={
                holding.state === 'current'
                  ? nationLabel(holding.nation)
                  : fr.selectedCountry.heldBySurveyed(
                      nationLabel(holding.nation),
                      asPressDate(holding.seenAt),
                    )
              }
            />
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * **Le littoral arrive après le plateau** : il vit dans `region-index.json`, 312 ko dont un seul
 * fait intéresse cet écran, et il n'a rien à faire dans le bundle de démarrage. La promesse est
 * partagée par le module, donc rouvrir le panneau ne relance rien. Tant qu'elle n'a pas répondu,
 * la ligne « côtière » manque et rien d'autre ne bouge.
 */
const NO_COAST: ReadonlySet<string> = new Set();

function useCoastalRegions(): ReadonlySet<string> {
  const [coastal, setCoastal] = useState<ReadonlySet<string>>(NO_COAST);
  useEffect(() => {
    let abandoned = false;
    void loadCoastalRegions().then((regions) => {
      if (!abandoned) setCoastal(regions);
    });
    return () => {
      abandoned = true;
    };
  }, []);
  return coastal;
}
