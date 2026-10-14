import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { nightInstant, raceAt, RACE_TO_WIN } from '@/domain/landing';
import { INK_BY_NATION } from '@/domain/nations';
import { fr } from '@/i18n/fr';
import type { LandingTable, SceneName, Story } from './table/table';

const page = fr.front.pages;

/**
 * **Les pages de l'édition** : une coupure par scène, posée sur la table que la carte joue. Le
 * titre dit ce qui se passe, la table le montre. Sans carte, elles portent tout le texte.
 */
export function Clippings({
  table,
  story,
  progress,
  scene,
  age,
  onAge,
  still,
}: {
  table: LandingTable | null;
  story: Story | null;
  progress: number;
  scene: SceneName;
  age: number;
  onAge: (hours: number) => void;
  still: boolean;
}) {
  const race = raceAt(scene === 'race' ? progress : 0);
  const leader = race.standings[0]!;
  const leaderName = fr.front.pages.race.nations[leader.nation as keyof typeof page.race.nations];
  const night = nightInstant(scene === 'night' ? progress : 0, Date.now());

  return (
    <>
      <Clipping
        scene="front"
        tilt={-0.8}
        folio={page.front.folio}
        time={page.front.time}
        title={page.front.title}
      >
        <p className="lp-chapo">{page.front.chapo}</p>
        <p className="lp-wide-only">{page.front.body}</p>
        <Steps steps={page.front.steps} now={story?.front.step ?? 0} />
        <p className="lp-legend">{page.front.legend}</p>
      </Clipping>

      <Clipping
        scene="fog"
        tilt={0.5}
        folio={page.fog.folio}
        time={page.fog.time}
        title={page.fog.title}
      >
        <p className="lp-chapo">{page.fog.chapo}</p>
        <p className="lp-wide-only">{page.fog.body}</p>
        <div className="lp-slider">
          <label htmlFor="lp-age">
            <span>{page.fog.age}</span>
            <span className="lp-num">{age === 0 ? page.fog.ageNow : page.fog.ageAgo(age)}</span>
          </label>
          <input
            id="lp-age"
            type="range"
            min={0}
            max={24}
            step={1}
            value={age}
            onChange={(event) => onAge(Number(event.target.value))}
          />
        </div>
        <div className="lp-states" role="group" aria-label={page.fog.statesLabel}>
          {(['lp-pencil', 'lp-engraved', 'lp-inked'] as const).map((matter, rank) => (
            <figure key={matter}>
              <i
                className={matter}
                style={{ '--fresh-ink': INK_BY_NATION.france } as CSSProperties}
              />
              <figcaption>{page.fog.states[rank]}</figcaption>
            </figure>
          ))}
        </div>
      </Clipping>

      <Clipping
        scene="battle"
        tilt={-0.4}
        folio={page.battle.folio}
        time={page.battle.time}
        title={page.battle.title}
      >
        <p className="lp-chapo">{page.battle.chapo}</p>
        <Steps steps={page.battle.steps} now={story?.battle.step ?? 0} />
        <p className="lp-dispatch">{page.battle.dispatch}</p>
        <p className="lp-legend lp-wide-only">{page.battle.legend}</p>
        <div>
          <button className="lp-btn" type="button" onClick={() => table?.replayAssault()}>
            {page.battle.replay}
          </button>
        </div>
      </Clipping>

      <Clipping
        scene="race"
        tilt={0.7}
        folio={page.race.folio}
        time={page.race.day(race.day)}
        title={page.race.title}
      >
        <p className="lp-chapo">{page.race.chapo}</p>
        <table className="lp-table lp-wide-only" aria-label={page.race.tableLabel}>
          <thead>
            <tr>
              <th>{page.race.belligerent}</th>
              <th>{page.race.points}</th>
              <th className="lp-r">{page.race.held}</th>
            </tr>
          </thead>
          <tbody>
            {race.standings.map(({ nation, points }) => (
              <tr key={nation}>
                <td>
                  <i className="lp-ink" style={{ background: INK_BY_NATION[nation] }} />
                  {page.press.rows.find((row) => row.nation === nation)?.pseudo}
                </td>
                <td>{points.map((point) => page.race.sites[point][0]).join(', ') || '—'}</td>
                <td className="lp-r">
                  <span className="lp-pips">
                    {Array.from({ length: RACE_TO_WIN }, (_, i) => (
                      <i
                        key={i}
                        style={{
                          background: i < points.length ? INK_BY_NATION[nation] : undefined,
                        }}
                      />
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="lp-headline" aria-live="polite">
          {race.countdown !== null ? (
            <>
              {page.race.winsIn(leaderName)}{' '}
              <span className="lp-num">{page.race.countdown(race.countdown)}</span>{' '}
              {page.race.ifNothingMoves}
            </>
          ) : leader.points.length === 0 ? (
            page.race.waiting
          ) : leader.points.length < 3 ? (
            page.race.takes(leaderName, page.race.sites[leader.points.at(-1)!][0])
          ) : (
            page.race.three(leaderName)
          )}
        </div>
        <p className="lp-legend">{page.race.legend}</p>
      </Clipping>

      <Clipping
        scene="night"
        tilt={-0.5}
        folio={page.night.folio}
        time={page.night.clock(night, 'Europe/Paris')}
        title={page.night.title}
      >
        <p className="lp-chapo">{page.night.chapo}</p>
        <p className="lp-wide-only">{page.night.body}</p>
        <p className="lp-dispatch lp-dispatch--ink">
          {(
            [
              ['london', 'Europe/London'],
              ['paris', 'Europe/Paris'],
              ['moscow', 'Europe/Moscow'],
            ] as const
          )
            .map(([city, zone]) => `${page.night.cities[city]} ${page.night.clock(night, zone)}`)
            .join(' · ')}
        </p>
      </Clipping>

      <Clipping
        scene="press"
        short
        wide
        tilt={-0.4}
        folio={page.press.folio}
        time={page.press.edition}
        title={page.press.title}
      >
        <p className="lp-chapo">{page.press.chapo}</p>
        <div className="lp-press">
          <table className="lp-table" aria-label={page.press.tableLabel}>
            <thead>
              <tr>
                <th>{page.press.rank}</th>
                <th>{page.press.nation}</th>
                <th className="lp-r">{page.press.territory}</th>
                <th className="lp-r">{page.press.general}</th>
              </tr>
            </thead>
            <tbody>
              {page.press.rows.map((row, rank) => (
                <tr key={row.pseudo}>
                  <td className="lp-num">{rank + 1}</td>
                  <td>
                    <i className="lp-ink" style={{ background: INK_BY_NATION[row.nation] }} />
                    {row.pseudo}
                  </td>
                  <td className="lp-r lp-num">{row.territory}</td>
                  <td className="lp-r lp-num">{row.general}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Telegraph on={scene === 'press'} still={still} />
        </div>
      </Clipping>
    </>
  );
}

function Clipping({
  scene,
  tilt,
  folio,
  time,
  title,
  short = false,
  wide = false,
  children,
}: {
  scene: SceneName;
  tilt: number;
  folio: string;
  time: string;
  title: string;
  short?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`lp-scene${short ? ' lp-scene--short' : ''}`}
      data-scene={scene}
      aria-labelledby={`lp-${scene}`}
    >
      <article
        className={`lp-clip${wide ? ' lp-clip--wide' : ''}`}
        style={{ '--tilt': `${tilt}deg` } as CSSProperties}
      >
        <div className="lp-folio">
          <span>{folio}</span>
          <span className="lp-num">{time}</span>
        </div>
        <h2 id={`lp-${scene}`}>{title}</h2>
        {children}
      </article>
    </section>
  );
}

function Steps({ steps, now }: { steps: ReadonlyArray<string>; now: number }) {
  return (
    <ol className="lp-steps">
      {steps.map((step, rank) => (
        <li key={step} className={rank < now ? 'lp-done' : rank === now ? 'lp-now' : undefined}>
          {step}
        </li>
      ))}
    </ol>
  );
}

/** The general channel's wires, one by one, each time the page is read. */
function Telegraph({ on, still }: { on: boolean; still: boolean }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timers = page.press.wires.map((_, rank) =>
      setTimeout(() => setShown(rank + 1), still ? 0 : 500 + rank * 1100),
    );
    return () => {
      timers.forEach(clearTimeout);
      setShown(0);
    };
  }, [on, still]);
  return (
    <div className="lp-telegraph" aria-live="polite">
      <div className="lp-telegraph-head">{page.press.telegraph}</div>
      {page.press.wires.map(([who, what], rank) => (
        <p key={who} className={rank < shown ? 'lp-in' : undefined}>
          <b>{who} —</b> {what}
        </p>
      ))}
    </div>
  );
}
