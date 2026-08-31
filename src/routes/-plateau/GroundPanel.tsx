import { countryLabel, fr, nationLabel } from '@/i18n/fr';
import { asPressDate } from '@/domain/duration';
import { NATION_BY_ADM0 } from '@/domain/nations';
import type { PlayerView } from '@/domain/player-view';
import type { RegionIdentity } from '@/domain/world';
import { Row, Panel } from './Panel';

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
 * A region the player does not hold carries no line of its own: `me.regions` is his ground and
 * nothing else, so absence is the fog rather than a display test (ADR 0005).
 *
 * **`survey` est ce que le joueur sait du sol survolé** (ADR 0020 §5) : à jour, il n'a rien à
 * dire — la teinte franche est déjà l'annonce ; relevé, il donne la date en clair. Vierge, il
 * est `null` et la carte n'a rien à en dire non plus.
 */
export function GroundPanel({
  selected,
  hoveredCountry,
  hoveredRegion,
  survey,
  view,
}: {
  selected: string | null;
  hoveredCountry: string | null;
  hoveredRegion: RegionIdentity | null;
  survey:
    { readonly state: 'current' } | { readonly state: 'surveyed'; readonly seenAt: number } | null;
  view: PlayerView;
}) {
  const country = hoveredRegion?.country ?? hoveredCountry ?? selected;
  if (country === null) return null;
  const hovered = hoveredRegion?.country === country ? hoveredRegion : null;

  const outpost = view.me.outposts.find((candidate) => candidate.hostCountry === country);
  // The map designates a country by its `adm0_a3`, opponents by their nation id: the mapping
  // is the seam — comparing the two raw strings never matches (that was a real bug).
  const nation = NATION_BY_ADM0.get(country);
  const opponent =
    nation === undefined ? undefined : view.opponents.find((other) => other.nation === nation);
  const region =
    hovered === null ? undefined : view.me.regions.find((one) => one.id === hovered.id);

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
          {region && (
            <>
              <p className="text-[11.5px] text-[var(--ink-soft)]">
                {region.deposit === null
                  ? fr.board.regionNoDeposit
                  : fr.board.regionDeposit(fr.deposits[region.deposit])}
              </p>
              {region.coastal && (
                <p className="text-[11px] text-[var(--ink-quiet)] italic">
                  {fr.board.regionCoastal}
                </p>
              )}
            </>
          )}
          {survey?.state === 'surveyed' && (
            <p className="text-[11px] text-[var(--ink-quiet)] italic">
              {fr.board.regionSurveyed(asPressDate(survey.seenAt))}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
