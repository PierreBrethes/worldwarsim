import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useCallback, useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import {
  fr,
  clockLabel,
  nationLabel,
  placeLabel,
  rendezvousLabel,
  countdownLabel,
} from '@/i18n/fr';
import { typo } from '@/i18n/typo';
import type { PlayableRegion } from '@/domain/ids';
import { frontPageOrder } from '@/domain/front-page';
import { normalizeGameCode } from '@/domain/off-season';
import { presenceOf } from '@/domain/operation-order';
import { MODE_RULES } from '@/domain/season-mode';
import { theatreById } from '@/domain/theatres';
import { Wordmark } from '@/shell/Masthead';
import { DestroyButton } from '@/shell/DestroyButton';
import { LaunchSequence } from '@/shell/LaunchSequence';
import { EngravedMap } from '@/emblems/EngravedMap';
import { FlagChip, OffSeasonPage, boxOf, romanDate } from '@/shell/OffSeason';
import { convexClient } from '@/data/convexClient';
import { handleError } from '@/data/errors';
import { resumeSeat } from '@/data/resumeSeat';
import { forgetSession, useSession } from '@/data/session';
import { currentPushEndpoint } from '@/data/pushDevice';
import { downloadRendezvous } from '@/data/rendezvous';

export const Route = createFileRoute('/accueil')({ component: Home });

function Home() {
  return convexClient ? (
    <ConnectedHome />
  ) : (
    <OffSeasonPage>
      <p className="note" style={{ padding: 40, color: 'var(--paper)' }}>
        {fr.auth.noBackend}
      </p>
    </OffSeasonPage>
  );
}

export type Seat = FunctionReturnType<typeof api.accounts.seats>[number];

/** Un salon qui attend ce joueur : sa nation, son « prêt », ou — fondateur — son lancement. */
const awaits = (seat: Seat): boolean => {
  const me = seat.table.find((entry) => entry.mine);
  if (me === undefined) return false;
  if (me.nation === null || !me.ready) return true;
  return seat.creator && seat.table.every((entry) => entry.ready);
};

/**
 * **La une de mon édition** (choix 13) : mes parties en articles triés par urgence, la plus
 * pressante à la une, et deux petites annonces — composer une partie, ouvrir un code. Supprimer
 * n'est plus ici : au salon pour un salon, au pli d'une partie conclue pour le reste.
 */
function ConnectedHome() {
  const navigate = useNavigate();
  const destroy = useMutation(api.seasons.destroy);
  const logout = useMutation(api.accounts.logout);
  const token = useSession() ?? '';
  const me = useQuery(api.accounts.me, { token });
  const seats = useQuery(api.accounts.seats, { token });
  const [resuming, setResuming] = useState<Seat | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const now = Date.now();
  const ordered = frontPageOrder(
    (seats ?? []).map((seat) => ({
      ...seat,
      scheduledAt: seat.orders.scheduledAt,
      awaited: awaits(seat),
    })),
    now,
  );
  const [lead, ...others] = ordered;

  const toBoard = useCallback(() => void navigate({ to: '/plateau' }), [navigate]);
  const resume = (seat: Seat) =>
    resumeSeat(seat, {
      salon: () => void navigate({ to: '/salon' }),
      plateau: () => setResuming(seat),
    });

  const openCode = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeGameCode(code);
    if (normalized === null) {
      setError(fr.errors.UNKNOWN_GAME_CODE());
      return;
    }
    void navigate({ to: '/rejoindre/$code', params: { code: normalized } });
  };

  const signOut = () =>
    void currentPushEndpoint()
      .then((endpoint) => logout({ token, ...(endpoint === null ? {} : { endpoint }) }))
      .finally(() => {
        forgetSession();
        void navigate({ to: '/connexion' });
      });

  return (
    <OffSeasonPage>
      <div className="front-wrap">
        <article className="sheet pile front" aria-labelledby="t-front">
          <div className="ears">
            <span className="eyebrow">
              {fr.auth.signedIn(me?.nickname ?? '')} ·{' '}
              <button type="button" className="link" style={EAR_LINK} onClick={signOut}>
                {fr.auth.logout}
              </button>
            </span>
            <span className="eyebrow">
              {fr.front.date(new Date(now))} · {fr.home.gamesCount(ordered.length)}
            </span>
          </div>
          <header className="mast">
            <div className="top" />
            <div className="top2" />
            <div className="wm" id="t-front">
              <Wordmark size={76} />
            </div>
            <div className="rule" />
            <div className="dl">
              <span>{fr.home.edition(me?.nickname ?? '')}</span>
              <span>{romanDate(new Date(now))}</span>
            </div>
          </header>
          <p className="tag">{fr.home.tagline}</p>
          <div className="rule double" />

          <div className="front-grid">
            {lead === undefined ? (
              <section className="lead" aria-labelledby="t-lead">
                <div>
                  <h1 id="t-lead">{typo(fr.home.emptyHeadline)}</h1>
                  <p className="italic stand">{fr.home.emptyStand}</p>
                </div>
              </section>
            ) : (
              <Lead seat={lead} now={now} onResume={() => resume(lead)} />
            )}

            <aside className="ads vrule" aria-label={fr.home.adsLabel}>
              <div className="ad ad-found">
                <span className="corner">{fr.home.adCorner}</span>
                <div className="eyebrow">{fr.home.foundEyebrow}</div>
                <h3>{typo(fr.home.foundTitle)}</h3>
                <p className="note">{fr.home.foundNote}</p>
                <Link className="btn primary wide" to="/fonder">
                  {fr.home.foundSubmit}
                </Link>
              </div>
              <form className="ad code" onSubmit={openCode}>
                <div className="eyebrow">{fr.home.joinEyebrow}</div>
                <h3>{typo(fr.home.joinTitle)}</h3>
                <label className="sr" htmlFor="code">
                  {fr.home.codeLabel}
                </label>
                <input
                  id="code"
                  value={code}
                  maxLength={6}
                  placeholder={fr.home.codePlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby="code-note"
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  }
                />
                <p className="note" id="code-note" style={{ margin: '8px 0 10px' }}>
                  {fr.home.codeNote}
                </p>
                {error && (
                  <p role="alert" className="wire-note" style={{ marginBottom: 10 }}>
                    {error}
                  </p>
                )}
                <button className="btn wide" type="submit">
                  {fr.home.joinSubmit}
                </button>
              </form>
            </aside>

            {others.length > 0 && (
              <section className="others" aria-labelledby="t-others">
                <div className="eyebrow h">
                  <span id="t-others">{fr.home.othersHeader}</span>
                  <span>{fr.home.othersNote}</span>
                </div>
                <div className="others-grid">
                  {others.map((seat) => (
                    <Story
                      key={seat.seasonId}
                      seat={seat}
                      now={now}
                      onResume={() => resume(seat)}
                      onDestroy={() =>
                        void destroy({ token, seasonId: seat.seasonId }).catch((problem: unknown) =>
                          handleError(problem, setError),
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
          <div className="colophon">
            <span>{fr.home.footerLeft}</span>
            <Link to="/credits">{fr.credits.open}</Link>
            <span className="num">{fr.home.footerRight(romanDate(new Date(now)))}</span>
          </div>
        </article>
        <div className="mbar">
          <Link className="btn primary" to="/fonder">
            {fr.home.compose}
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => document.getElementById('code')?.focus()}
          >
            {fr.home.haveCode}
          </button>
        </div>
      </div>

      {resuming && (
        <LaunchSequence
          region={placeLabel(
            resuming.mode,
            resuming.theatre,
            regionNameOf(resuming.playableRegion),
          )}
          pace={clockLabel(resuming.durationHours)}
          players={resuming.players}
          onEnd={toBoard}
        />
      )}
    </OffSeasonPage>
  );
}

const EAR_LINK = { fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase' } as const;

const regionNameOf = (region: string): string =>
  fr.playableRegions[region as PlayableRegion] ?? region;

const theatreName = (theatre: string | null): string =>
  theatre === null ? '' : ((fr.modes.theatres as Record<string, string>)[theatre] ?? fr.table.draw);

/** La une : une Blitz qui se prépare a son heure et sa table ; tout le reste, un titre et un geste. */
function Lead({ seat, now, onResume }: { seat: Seat; now: number; onResume: () => void }) {
  const theatre = theatreById(seat.theatre ?? '');
  const blitzLobby = seat.mode === 'blitz' && seat.status === 'lobby';
  const story = storyOf(seat, now);
  const free = Math.max(0, seat.maximum - seat.table.length);
  return (
    <section className="lead" aria-labelledby="t-lead">
      <div>
        <div className="kicker">
          <span className="chip solid">{fr.home.onTheFront}</span>
          <span className="eyebrow">{story.kicker}</span>
        </div>
        <h1 id="t-lead">{typo(story.headline)}</h1>
        {story.stand && <p className="italic stand">{story.stand}</p>}
        {blitzLobby && seat.orders.scheduledAt !== null && (
          <div className="countbox" role="group" aria-label={fr.table.rendezvous}>
            <div>
              <div className="eyebrow">{fr.table.rendezvous}</div>
              <div className="big">{fr.table.hour(seat.orders.scheduledAt)}</div>
            </div>
            <div>
              <div className="eyebrow">{fr.table.in}</div>
              <div className="big">{countdownLabel(seat.orders.scheduledAt - now)}</div>
            </div>
          </div>
        )}
        {seat.status === 'lobby' && (
          <div className="seatsmini" aria-label={fr.home.atTable}>
            {seat.table.map((entry) => {
              const presence = presenceOf(entry.seenAt, now);
              return (
                <span key={`${entry.nickname}${entry.mine}`}>
                  <FlagChip nation={entry.nation} width={18} />
                  {entry.mine ? fr.table.you : entry.nickname}
                  {seat.mode === 'blitz' && !entry.mine && presence.kind !== 'unknown' && (
                    <span
                      className={`lamp ${presence.kind === 'present' ? 'on' : 'off'}`}
                      title={presence.kind === 'present' ? fr.table.atTable : fr.table.away}
                    />
                  )}
                </span>
              );
            })}
            {free > 0 && <span className="free">{fr.home.freeSeats(free)}</span>}
          </div>
        )}
        <div className="actions">
          <button type="button" className="btn primary" onClick={onResume}>
            {story.action}
          </button>
          {blitzLobby && seat.orders.scheduledAt !== null && (
            <button
              type="button"
              className="link"
              onClick={() =>
                downloadRendezvous({
                  at: seat.orders.scheduledAt!,
                  title: fr.home.calendarTitle(theatreName(seat.theatre)),
                  code: seat.code,
                })
              }
            >
              {fr.home.addToCalendar}
            </button>
          )}
        </div>
      </div>
      <figure className="illus" style={{ margin: 0 }}>
        <div className="mapbox">
          {theatre !== null ? (
            <EngravedMap
              box={boxOf(theatre.box)}
              px={420}
              frame={boxOf(theatre.box)}
              veil={0.25}
              pad={0.02}
              rings={[9, 6, 3.6, 1.6]}
            />
          ) : (
            <EngravedMap
              box={[-170, -56, 190, 76]}
              px={420}
              flat
              gratStep={30}
              rings={[5, 2.4]}
              pad={0.01}
            />
          )}
          <div
            className="cartouche"
            style={{ right: 8, top: 8, transform: 'scale(.78)', transformOrigin: 'top right' }}
          >
            <div className="eyebrow">
              {seat.mode === 'blitz' ? fr.table.theatreSheet : fr.table.worldSheet}
            </div>
            <h4>{seat.mode === 'blitz' ? theatreName(seat.theatre) : fr.table.world}</h4>
          </div>
        </div>
      </figure>
    </section>
  );
}

function Story({
  seat,
  now,
  onResume,
  onDestroy,
}: {
  seat: Seat;
  now: number;
  onResume: () => void;
  onDestroy: () => void;
}) {
  const story = storyOf(seat, now);
  return (
    <div className="story">
      {seat.status === 'concluded' && (
        <span className="stamp ink" style={{ top: 4, right: 8 }} aria-hidden>
          {fr.home.concluded}
        </span>
      )}
      <span className="kicker" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <FlagChip nation={seat.nation} width={22} />
        <span className="eyebrow">{story.kicker}</span>
      </span>
      <h2>{typo(story.headline)}</h2>
      {story.stand && <span className="meta">{story.stand}</span>}
      <button type="button" className="go btn small" onClick={onResume}>
        {story.action}
      </button>
      {seat.status === 'concluded' && seat.creator && (
        <details className="more-menu">
          <summary className="link">{fr.home.moreMenu}</summary>
          <DestroyButton
            label={fr.lobby.destroy}
            confirm={fr.lobby.destroyConfirm}
            note={fr.lobby.destroyNote}
            onDestroy={onDestroy}
          />
        </details>
      )}
    </div>
  );
}

type Told = { kicker: string; headline: string; stand: string | null; action: string };

/** Ce qu'un article dit de la partie : de quoi décider, et rien d'autre. */
function storyOf(seat: Seat, now: number): Told {
  const place = seat.mode === 'blitz' ? theatreName(seat.theatre) : fr.table.world;
  const mode = fr.modes[seat.mode].name;
  if (seat.status === 'concluded') {
    return {
      kicker: `${mode} · ${place}${seat.concludedAt === null ? '' : ` · ${fr.home.day(seat.concludedAt)}`}`,
      headline:
        seat.winnerNation === null
          ? fr.home.concludedNoWinner
          : fr.home.won(nationLabel(seat.winnerNation)),
      stand: seat.defeated ? fr.home.youWereDefeated : null,
      action: fr.home.readBack,
    };
  }
  if (seat.status === 'launched') {
    const left =
      seat.launchedAt === null || seat.durationHours === null
        ? null
        : seat.launchedAt + seat.durationHours * 3_600_000 - now;
    return {
      kicker:
        seat.mode === 'blitz'
          ? `${mode} · ${place}`
          : `${mode} · ${fr.home.dayOf(seat.launchedAt ?? now, now, seat.durationHours ?? MODE_RULES.mondiale.clockHours)}`,
      headline: seat.defeated
        ? fr.home.observing(nationLabel(seat.nation))
        : seat.mode === 'blitz'
          ? fr.home.blitzRunning(place)
          : fr.home.mondialeRunning(nationLabel(seat.nation)),
      stand: left === null ? null : fr.home.endsIn(countdownLabel(Math.max(0, left))),
      action: seat.defeated ? fr.home.observe : fr.home.resumeAs(nationLabel(seat.nation)),
    };
  }
  const ready = seat.table.filter((entry) => entry.ready).length;
  const me = seat.table.find((entry) => entry.mine);
  const founder = seat.table.find((entry) => entry.creator);
  const free = Math.max(0, seat.maximum - seat.table.length);
  const waiting =
    me?.nation === null
      ? fr.home.waitingNation(seat.mode === 'blitz')
      : me?.ready === false
        ? fr.home.waitingReady
        : seat.creator && ready === seat.table.length
          ? fr.home.waitingLaunch
          : fr.home.waitingOthers;
  if (seat.mode === 'blitz') {
    return {
      kicker: `${mode} · ${
        seat.orders.scheduledAt === null
          ? fr.table.whenFull
          : rendezvousLabel(seat.orders.scheduledAt, now)
      }`,
      headline: fr.home.blitzLobbyHeadline(seat.orders.scheduledAt, now, place, seat.maximum),
      stand: seat.creator
        ? fr.home.yourTable(free)
        : fr.home.keptForYou(founder?.nickname ?? '', free),
      action: fr.home.joinTable,
    };
  }
  return {
    kicker: `${mode} · ${fr.home.lobbyCode(seat.code)}`,
    headline: fr.home.lobbyHeadline(seat.table.length, seat.maximum, ready, waiting),
    stand: null,
    action: fr.home.toLobby,
  };
}
