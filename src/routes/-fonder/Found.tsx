import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr, rendezvousLabel } from '@/i18n/fr';
import { DEFAULT_HQ_CAPTURE_HOURS, nextEvening } from '@/domain/operation-order';
import { MODE_RULES, type SeasonMode } from '@/domain/season-mode';
import { THEATRES, theatreById, type TheatreId } from '@/domain/theatres';
import { Wordmark } from '@/shell/Masthead';
import { EngravedMap, WORLD_BOX } from '@/emblems/EngravedMap';
import { OffSeasonPage, boxOf } from '@/shell/OffSeason';
import { useClock } from '@/shell/clock';
import { handleError } from '@/data/errors';
import { keepSeat, useSession } from '@/data/session';
import { useSingleFlight } from '@/data/useSingleFlight';
import './found.css';

const route = getRouteApi('/fonder');

/**
 * **Fonder, c'est choisir sa guerre** : une Blitz ou une Mondiale, et le clic fonde. Le mode est
 * le seul réglage qui ne se reprend pas ; tout le reste — théâtre, rendez-vous, durée, capture,
 * places — part à sa valeur d'usage et se règle au salon jusqu'au lancement, là où la table le
 * voit changer. Une table refusée ailleurs amène ses réglages (`?mode`, `?theatre`, choix 19).
 */
export function Found() {
  const search = route.useSearch();
  const navigate = useNavigate();
  const token = useSession() ?? '';
  const create = useMutation(api.seasons.create);
  const { run, pending } = useSingleFlight();
  const [error, setError] = useState<string | null>(null);
  /** L'heure proposée suit la pendule : une page ouverte passé 21:00 propose demain. */
  const now = useClock(30_000);
  const evening = nextEvening(new Date(now));
  const theatre = theatreById(search.theatre ?? '') ?? THEATRES[0];

  const found = (mode: SeasonMode) =>
    void run(async () => {
      setError(null);
      try {
        const { seasonId } = await create({
          token,
          compensation: 0.5,
          mode,
          ...(mode === 'blitz'
            ? { theatre: theatre.id, scheduledAt: evening, remind: true }
            : {
                hqCaptureHours: DEFAULT_HQ_CAPTURE_HOURS,
                durationHours: MODE_RULES.mondiale.clockHours,
              }),
        });
        keepSeat(seasonId);
        void navigate({ to: '/salon' });
      } catch (problem) {
        handleError(problem, setError);
      }
    });

  return (
    <OffSeasonPage>
      <div className="fd">
        <article className="sheet fd-sheet" aria-labelledby="t-order">
          <div className="fd-head">
            <Link className="link" to="/accueil">
              {fr.found.back}
            </Link>
            <Wordmark size={20} />
          </div>
          <div className="rule double" />
          <h1 id="t-order">{fr.found.headline}</h1>
          <div className="fd-wars">
            {(['blitz', 'mondiale'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="fd-war"
                data-asked={search.mode === mode ? '' : undefined}
                aria-busy={pending}
                onClick={() => found(mode)}
              >
                <div className="mapbox">
                  {mode === 'blitz' ? (
                    <EngravedMap
                      box={boxOf(theatre.box)}
                      px={520}
                      frame={boxOf(theatre.box)}
                      veil={0.2}
                      pad={0.12}
                      rings={[7, 4.2, 1.8]}
                    />
                  ) : (
                    <EngravedMap
                      box={WORLD_BOX}
                      px={520}
                      rings={[4.4, 2]}
                      flat
                      fit="slice"
                      gratStep={30}
                      nations={{ france: {}, germany: {}, japan: {}, usa: {}, ussr: {} }}
                    />
                  )}
                </div>
                <div className="fd-body">
                  <h2>
                    {fr.modes[mode].name}
                    <small>{fr.found.modes[mode].span}</small>
                  </h2>
                  <dl>
                    {fr.found.modes[mode].facts.map(([term, fact]) => (
                      <Fact key={term} term={term} fact={fact} />
                    ))}
                  </dl>
                </div>
                <span className="fd-go">
                  {mode === 'blitz'
                    ? fr.found.foundBlitz(
                        fr.modes.theatres[theatre.id as TheatreId],
                        rendezvousLabel(evening, now),
                      )
                    : fr.found.foundMondiale}
                </span>
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="wire-note">
              {error}
            </p>
          )}
          <p className="fd-later">{fr.found.later}</p>
        </article>
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
