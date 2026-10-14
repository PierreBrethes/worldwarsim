import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import { fr, rendezvousLabel } from '@/i18n/fr';
import {
  DEFAULT_HQ_CAPTURE_HOURS,
  HQ_CAPTURE_HOURS,
  THEATRE_DRAW,
  nextEvening,
} from '@/domain/operation-order';
import { seatRangeOf, type SeasonMode } from '@/domain/season-mode';
import { THEATRES, type TheatreId } from '@/domain/theatres';
import { Wordmark } from '@/shell/Masthead';
import { EngravedMap, WORLD_BOX } from '@/emblems/EngravedMap';
import { OffSeasonPage, boxOf, localInput } from '@/shell/OffSeason';
import { Telegram } from '@/shell/Telegram';
import { handleError } from '@/data/errors';
import { keepSeat, useSession } from '@/data/session';
import { useSingleFlight } from '@/data/useSingleFlight';

type Search = { mode?: SeasonMode; theatre?: string };

export const Route = createFileRoute('/fonder')({
  component: Found,
  /** « Composer à mon tour », depuis un refus (choix 19) : les réglages de la partie refusée. */
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.mode === 'blitz' || search.mode === 'mondiale' ? { mode: search.mode } : {}),
    ...(typeof search.theatre === 'string' ? { theatre: search.theatre } : {}),
  }),
});

type When = 'tonight' | 'tomorrow' | 'custom' | 'full';
const DAY_MS = 86_400_000;

/**
 * **L'ordre d'opérations** (choix 1, 5, 10, M15) : un formulaire numéroté, et en face le
 * télégramme d'invitation qui s'écrit mot pour mot. Chaque mode ne montre que ses sections :
 * théâtre, rendez-vous et places en Blitz ; prise d'un QG et places en Mondiale. Tout se reprend
 * au salon jusqu'au lancement.
 */
function Found() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const token = useSession() ?? '';
  const me = useQuery(api.accounts.me, { token });
  const create = useMutation(api.seasons.create);
  const { run, pending } = useSingleFlight();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SeasonMode>(search.mode ?? 'blitz');
  const [theatre, setTheatre] = useState<string>(
    THEATRES.some((candidate) => candidate.id === search.theatre) ? search.theatre! : 'europe',
  );
  const [when, setWhen] = useState<When>('tonight');
  const [now] = useState(() => Date.now());
  const evening = nextEvening(new Date(now));
  const [customAt, setCustomAt] = useState(localInput(evening + DAY_MS));
  const [remind, setRemind] = useState(true);
  const [capture, setCapture] = useState<number>(DEFAULT_HQ_CAPTURE_HOURS);
  const range = seatRangeOf(mode, mode === 'blitz' ? theatre : null);
  const [seatsAsked, setSeats] = useState<number | null>(null);
  const seats = Math.min(seatsAsked ?? range.max, range.max);
  const [fresh, setFresh] = useState(-1);
  const blitz = mode === 'blitz';

  const scheduledAt =
    when === 'tonight'
      ? evening
      : when === 'tomorrow'
        ? evening + DAY_MS
        : when === 'custom'
          ? new Date(customAt).getTime()
          : null;
  const touch = (line: number, change: () => void) => {
    change();
    setFresh(line);
  };

  const from = me?.nickname ?? '';
  const theatreName = theatre === THEATRE_DRAW ? null : fr.modes.theatres[theatre as TheatreId];
  const lines = blitz
    ? fr.table.telegram.blitzLines({
        from,
        theatre: theatreName,
        when: scheduledAt === null ? null : rendezvousLabel(scheduledAt, now),
        seats: { taken: null, cap: seats },
      })
    : fr.table.telegram.mondialeLines({ from, capture, seats: { taken: null, cap: seats } });

  const found = () =>
    void run(async () => {
      setError(null);
      if (scheduledAt !== null && Number.isNaN(scheduledAt)) {
        setError(fr.errors.RENDEZVOUS_PAST());
        return;
      }
      try {
        const { seasonId } = await create({
          token,
          compensation: 0.5,
          mode,
          ...(seats < range.max ? { seatCap: seats } : {}),
          ...(blitz ? { theatre, scheduledAt, remind } : { hqCaptureHours: capture }),
        });
        keepSeat(seasonId);
        void navigate({ to: '/salon' });
      } catch (problem) {
        handleError(problem, setError);
      }
    });

  const submit = (
    <button
      type="button"
      className="btn primary"
      onClick={found}
      aria-disabled={pending || undefined}
    >
      {fr.found.submit}
    </button>
  );

  return (
    <OffSeasonPage>
      <div className="found-wrap">
        <div className="found">
          <article className="sheet order" aria-labelledby="t-order">
            <div className="ohead">
              <Link className="link" to="/accueil">
                {fr.found.back}
              </Link>
              <Wordmark size={20} />
              <span className="eyebrow">{fr.found.number}</span>
            </div>
            <div className="rule double" />
            <h1 id="t-order">{fr.found.title}</h1>
            <p className="sub">{fr.found.sub}</p>

            <section className="sect" aria-labelledby="t-s1">
              <span className="no">I.</span>
              <div>
                <h2 id="t-s1">{fr.found.modeTitle}</h2>
                <p className="note">{fr.found.modeNote}</p>
                <div className="modes" role="radiogroup" aria-labelledby="t-s1">
                  {(['blitz', 'mondiale'] as const).map((candidate) => (
                    <button
                      key={candidate}
                      type="button"
                      className="modecard"
                      role="radio"
                      aria-checked={mode === candidate}
                      onClick={() => touch(1, () => setMode(candidate))}
                    >
                      <div className="mapbox">
                        {candidate === 'blitz' ? (
                          <EngravedMap
                            box={[-12, 36, 40, 66]}
                            px={330}
                            frame={boxOf(THEATRES[0].box)}
                            veil={0.2}
                            rings={[6, 3.6, 1.6]}
                            thumb
                          />
                        ) : (
                          <EngravedMap
                            box={WORLD_BOX}
                            px={330}
                            rings={[3.6, 1.6]}
                            thumb
                            flat
                            gratStep={30}
                            nations={{ france: {}, germany: {}, japan: {}, usa: {}, ussr: {} }}
                          />
                        )}
                      </div>
                      <div className="body">
                        <h3>
                          {fr.modes[candidate].name}
                          <small>{fr.found.modes[candidate].span}</small>
                        </h3>
                        <dl>
                          {fr.found.modes[candidate].facts.map(([term, fact]) => (
                            <Fact key={term} term={term} fact={fact} />
                          ))}
                        </dl>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {blitz ? (
              <>
                <section className="sect" aria-labelledby="t-s2">
                  <span className="no">II.</span>
                  <div>
                    <h2 id="t-s2">{fr.found.theatreTitle}</h2>
                    <p className="note">{fr.found.theatreNote}</p>
                    <div className="theatres" role="radiogroup" aria-labelledby="t-s2">
                      {THEATRES.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          className="thcard"
                          role="radio"
                          aria-checked={theatre === candidate.id}
                          onClick={() => touch(1, () => setTheatre(candidate.id))}
                        >
                          <div className="mapbox">
                            <EngravedMap
                              box={boxOf(candidate.box)}
                              px={150}
                              frame={boxOf(candidate.box)}
                              veil={0.32}
                              pad={0.14}
                              rings={[4, 1.8]}
                              thumb
                            />
                          </div>
                          <span>
                            {fr.modes.theatres[candidate.id]}
                            <small>
                              {fr.modes.theatrePlayers(
                                candidate.players.min,
                                candidate.players.max,
                              )}
                              {' · '}
                              {fr.found.theatreTag[candidate.id]}
                            </small>
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        className="thcard draw"
                        role="radio"
                        aria-checked={theatre === THEATRE_DRAW}
                        onClick={() => touch(1, () => setTheatre(THEATRE_DRAW))}
                      >
                        <div className="mapbox">
                          <span className="die" aria-hidden>
                            ?
                          </span>
                        </div>
                        <span>
                          {fr.table.draw}
                          <small>{fr.found.drawNote}</small>
                        </span>
                      </button>
                    </div>
                  </div>
                </section>
                <section className="sect" aria-labelledby="t-s3">
                  <span className="no">III.</span>
                  <div>
                    <h2 id="t-s3">{fr.found.whenTitle}</h2>
                    <p className="note">{fr.found.whenNote}</p>
                    <div className="when">
                      <div className="segm" role="radiogroup" aria-labelledby="t-s3">
                        {(
                          [
                            ['tonight', fr.table.dayWord(evening, now), fr.table.hour(evening)],
                            [
                              'tomorrow',
                              fr.table.dayWord(evening + DAY_MS, now),
                              fr.table.hour(evening),
                            ],
                            ['custom', fr.found.custom, fr.found.toChoose],
                            ['full', fr.found.full, fr.found.noHour],
                          ] as const
                        ).map(([key, label, note]) => (
                          <button
                            key={key}
                            type="button"
                            role="radio"
                            aria-checked={when === key}
                            onClick={() => touch(2, () => setWhen(key))}
                          >
                            {label}
                            <small>{note}</small>
                          </button>
                        ))}
                      </div>
                      {when === 'custom' && (
                        <div className="row">
                          <label className="sr" htmlFor="rdvat">
                            {fr.found.customLabel}
                          </label>
                          <input
                            type="datetime-local"
                            id="rdvat"
                            value={customAt}
                            min={localInput(now)}
                            onChange={(event) => touch(2, () => setCustomAt(event.target.value))}
                          />
                          <span className="note">{fr.found.localTime}</span>
                        </div>
                      )}
                      {when !== 'full' && (
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={remind}
                            onChange={(event) => setRemind(event.target.checked)}
                          />
                          {fr.found.remind}
                        </label>
                      )}
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <section className="sect" aria-labelledby="t-s2">
                <span className="no">II.</span>
                <div>
                  <h2 id="t-s2">{fr.found.captureTitle}</h2>
                  <p className="note">{fr.found.captureNote}</p>
                  <div className="segm" role="radiogroup" aria-labelledby="t-s2">
                    {HQ_CAPTURE_HOURS.map((hours) => (
                      <button
                        key={hours}
                        type="button"
                        role="radio"
                        aria-checked={capture === hours}
                        onClick={() => touch(3, () => setCapture(hours))}
                      >
                        {fr.found.hours(hours)}
                        <small>{fr.found.captureTag(hours)}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="sect" aria-labelledby="t-s4">
              <span className="no">{blitz ? 'IV.' : 'III.'}</span>
              <div>
                <h2 id="t-s4">{fr.found.seatsTitle}</h2>
                <p className="note">{fr.found.seatsNote(blitz, range.max)}</p>
                <div className="stepper" role="group" aria-labelledby="t-s4">
                  <button
                    type="button"
                    aria-label={fr.table.seatLess}
                    onClick={() =>
                      touch(blitz ? 3 : 4, () => setSeats(Math.max(range.min, seats - 1)))
                    }
                  >
                    −
                  </button>
                  <output aria-live="polite">{fr.found.seats(seats)}</output>
                  <button
                    type="button"
                    aria-label={fr.table.seatMore}
                    onClick={() =>
                      touch(blitz ? 3 : 4, () => setSeats(Math.min(range.max, seats + 1)))
                    }
                  >
                    +
                  </button>
                </div>
                <span className="chairs" aria-hidden>
                  {Array.from({ length: range.max }, (_, rank) => (
                    <i key={rank} className={rank < seats ? 'on' : ''} />
                  ))}
                </span>
              </div>
            </section>

            {error && (
              <p role="alert" className="wire-note">
                {error}
              </p>
            )}
            <div className="submit">
              <span className="note">{fr.found.nothingLeaves}</span>
              {submit}
            </div>
          </article>

          <aside className="aside-preview" aria-label={fr.found.previewLabel}>
            <span className="eyebrow">{fr.found.preview}</span>
            <Telegram
              lines={lines}
              code="······"
              origin={fr.table.telegram.tableOf(from)}
              filed={fr.table.telegram.filedAt(now)}
              fresh={fresh}
            />
            <p className="note" style={{ color: 'var(--paper-dim-2)', margin: '4px 0 0' }}>
              {fr.found.previewNote}
            </p>
          </aside>
        </div>
        <div className="mbar single">{submit}</div>
      </div>
    </OffSeasonPage>
  );
}

function Fact({ term, fact }: { term: string; fact: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{fact}</dd>
    </>
  );
}
