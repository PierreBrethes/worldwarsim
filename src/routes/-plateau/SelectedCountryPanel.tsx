import { fr, nationLabel } from '@/i18n/fr';
import { NATION_BY_COUNTRY } from '@/domain/nations';
import type { PlayerView } from '@/domain/player-view';
import { Row, Panel } from './Panel';

export function SelectedCountryPanel({ country, view }: { country: string; view: PlayerView }) {
  const outpost = view.me.outposts.find((candidate) => candidate.hostCountry === country);
  // The map speaks country names, opponents speak nation ids: the mapping is the seam —
  // comparing the two raw strings never matches (that was a real bug).
  const nation = NATION_BY_COUNTRY.get(country);
  const opponent =
    nation === undefined ? undefined : view.opponents.find((other) => other.nation === nation);

  return (
    <Panel
      title={opponent ? fr.selectedCountry.enemyTitle : fr.selectedCountry.neutralTitle}
      marker={fr.selectedCountry.marker}
      position="static"
      width={280}
    >
      <h2 className="font-[var(--font-display)] text-[22px] font-extrabold tracking-[.02em] text-[var(--ink)] uppercase">
        {nation === undefined ? country : nationLabel(nation)}
      </h2>

      {opponent ? (
        <>
          <Row
            label={fr.selectedCountry.progression}
            value={`${Math.round(opponent.bar.progress * 100)} %`}
          />
          <Row
            label={fr.selectedCountry.doctrine}
            value={
              opponent.bar.state === 'attributed'
                ? fr.doctrines[opponent.bar.doctrine]
                : fr.selectedCountry.unknown
            }
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
    </Panel>
  );
}
