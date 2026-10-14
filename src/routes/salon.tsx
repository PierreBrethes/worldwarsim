import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../convex/_generated/api';
import {
  fr,
  countdownLabel,
  nationLabel,
  placeLabel,
  clockLabel,
  rendezvousLabel,
} from '@/i18n/fr';
import { NATIONS, isNation } from '@/domain/nations';
import type { PlayableRegion } from '@/domain/ids';
import {
  HQ_CAPTURE_HOURS,
  LOBBY_BEAT_SECONDS,
  THEATRE_DRAW,
  launchPlanOf,
  nextEvening,
  presenceOf,
  settingsRefusalOf,
  type Settings,
} from '@/domain/operation-order';
import { seatRangeOf } from '@/domain/season-mode';
import { THEATRES, theatreById, type TheatreId } from '@/domain/theatres';
import { invitationUrl } from '@/domain/off-season';
import { toLocalMinutes, toUtcMinutes } from '@/domain/rest-window';
import { spriteUrl } from '@/emblems/units/manifest';
import { convexClient } from '@/data/convexClient';
import { errorCode, handleError } from '@/data/errors';
import { useSingleFlight } from '@/data/useSingleFlight';
import { forgetSeat, useSeat, type Seat } from '@/data/session';
import { useTelegraph } from '@/data/telegraph';
import { useClock } from '@/shell/clock';
import { DestroyButton } from '@/shell/DestroyButton';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleSeat } from '@/shell/StaleSeat';
import { LaunchSequence } from '@/shell/LaunchSequence';
import { Wordmark } from '@/shell/Masthead';
import { notify } from '@/shell/notifications';
import { CompassRoseMark, EngravedMap, WORLD_BOX, projectOn } from '@/emblems/EngravedMap';
import { FlagChip, OffSeasonPage, boxOf } from '@/shell/OffSeason';
import { TelegraphPanel, useReadOnUnmount, useTelegraphTabs } from '@/shell/TelegraphPanel';

export const Route = createFileRoute('/salon')({
  component: Lobby,
  errorComponent: ({ error, reset }) => <LobbyError error={error} reset={reset} />,
});

/** Une place morte au salon n'est pas une panne : on l'oublie et on rentre à l'accueil. */
function LobbyError({ error, reset }: { error: unknown; reset: () => void }) {
  const code = errorCode(error);
  if (code === 'NO_SEAT' || code === 'SEASON_GONE') return <StaleSeat to="/accueil" />;
  return <ErrorScreen error={error} reset={reset} />;
}

function Lobby() {
  const seat = useSeat();
  if (!convexClient || !seat) return <Navigate to="/accueil" replace />;
  return <ConnectedLobby seat={seat} />;
}

type LobbyView = FunctionReturnType<typeof api.seasons.lobby>;
type Player = LobbyView['players'][number];
type View = 'table' | 'ordre' | 'wire';

/** Les capitales de 1940, où le drapeau d'une nation retenue se plante sur la carte du monde. */
const CAPITALS: Readonly<Record<string, readonly [number, number]>> = {
  france: [2.35, 48.86],
  uk: [-0.13, 51.5],
  usa: [-77.04, 38.9],
  ussr: [37.62, 55.75],
  germany: [13.4, 52.52],
  japan: [139.69, 35.69],
  italy: [12.5, 41.9],
  china: [106.55, 29.56],
};

/** **À la table** : le salon d'une Blitz bat tant qu'il est à l'écran (choix 7). */
function useLobbyBeat(seat: Seat, beating: boolean) {
  const beat = useMutation(api.players.beatLobby);
  useEffect(() => {
    if (!beating) return;
    const once = () => {
      if (document.visibilityState === 'visible') void beat(seat).catch(() => undefined);
    };
    once();
    const timer = window.setInterval(once, LOBBY_BEAT_SECONDS * 1000);
    document.addEventListener('visibilitychange', once);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', once);
    };
  }, [beat, seat, beating]);
}

/**
 * **La table d'état-major** (choix 2) : la carte gravée du théâtre ou du monde au centre, un carton
 * par place autour, l'ordre d'opérations replié à gauche, le télégraphe en fenêtre à droite, et
 * « votre place » dessous. Le salon trie : il ne montre que ce qui sert la décision du moment, et
 * dit en une phrase ce que la table attend.
 */
function ConnectedLobby({ seat }: { seat: Seat }) {
  const navigate = useNavigate();
  const lobby = useQuery(api.seasons.lobby, seat);
  const blitzLobby = lobby?.mode === 'blitz' && lobby.status === 'lobby';
  useLobbyBeat(seat, blitzLobby);
  const toBoard = useCallback(() => void navigate({ to: '/plateau', replace: true }), [navigate]);

  if (lobby === undefined) {
    return (
      <OffSeasonPage>
        <p className="eyebrow dark" style={{ padding: 40 }}>
          {fr.lobby.opening}
        </p>
      </OffSeasonPage>
    );
  }
  const launching = lobby.status === 'launched' && lobby.me.atWar;
  return (
    <OffSeasonPage>
      <Table seat={seat} lobby={lobby} />
      {launching && (
        <LaunchSequence
          region={placeLabel(lobby.mode, lobby.theatre, regionNameOf(lobby.playableRegion))}
          pace={clockLabel(lobby.durationHours)}
          players={lobby.players.length}
          onEnd={toBoard}
        />
      )}
    </OffSeasonPage>
  );
}

const regionNameOf = (region: string): string =>
  fr.playableRegions[region as PlayableRegion] ?? region;

const theatreName = (theatre: string | null): string =>
  theatre === null || theatre === THEATRE_DRAW
    ? fr.table.draw
    : ((fr.modes.theatres as Record<string, string>)[theatre] ?? theatre);

function Table({ seat, lobby }: { seat: Seat; lobby: LobbyView }) {
  const navigate = useNavigate();
  const reserve = useMutation(api.players.reserveNation);
  const declareReady = useMutation(api.players.declareReady);
  const launch = useMutation(api.seasons.launch);
  const enterWar = useMutation(api.seasons.enterWar);
  const destroy = useMutation(api.seasons.destroy);
  const configure = useMutation(api.seasons.configure);
  const { run } = useSingleFlight();
  const now = useClock(15_000);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('table');
  const [editing, setEditing] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [wireOpen, setWireOpen] = useState(true);

  const blitz = lobby.mode === 'blitz';
  const founder = lobby.me.creator;
  /** Un retardataire d'une Mondiale lancée : une nation libre, puis il entre. Rien à attendre. */
  const entering = lobby.status === 'launched' && !lobby.me.atWar;
  const open = lobby.status === 'lobby';
  const meRow = lobby.players.find((player) => player.mine);
  const founderNick = lobby.players.find((player) => player.creator)?.nickname ?? '';
  const free = Math.max(0, lobby.maximum - lobby.players.length);
  const theatre = blitz ? theatreById(lobby.theatre ?? '') : null;
  const scheduledAt = lobby.orders.scheduledAt;

  const act = (action: () => Promise<unknown>) =>
    void run(async () => {
      setError(null);
      await action();
    }).catch((problem: unknown) => handleError(problem, setError));

  const settings: Settings = {
    mode: lobby.mode,
    theatre: lobby.theatre,
    scheduledAt,
    remind: lobby.orders.remind,
    hqCaptureHours: lobby.orders.hqCaptureHours,
    seatCap: lobby.orders.seatCap,
  };
  /** Modifier l'ordre : ce que la fonction de refus partagée laisse passer est offert, le reste
   *  ne l'est pas — rien n'est grisé (ADR 0015). Le serveur lève les « prêt ». */
  const offered = (change: Partial<Settings>) =>
    settingsRefusalOf(
      { ...settings, ...change },
      { seated: lobby.players.length, now, rendezvousChanged: 'scheduledAt' in change },
    ) === null;
  const change = (patch: Partial<Settings>, say: string) =>
    act(async () => {
      await configure({
        ...seat,
        ...(patch.theatre === undefined || patch.theatre === null
          ? {}
          : { theatre: patch.theatre }),
        ...('scheduledAt' in patch ? { scheduledAt: patch.scheduledAt ?? null } : {}),
        ...(patch.remind === undefined || patch.remind === null ? {} : { remind: patch.remind }),
        ...(patch.hqCaptureHours === undefined || patch.hqCaptureHours === null
          ? {}
          : { hqCaptureHours: patch.hqCaptureHours }),
        ...(patch.seatCap === undefined || patch.seatCap === null
          ? {}
          : { seatCap: patch.seatCap }),
      });
      notify(fr.table.orderChanged(say), 'info');
    });

  const plan = launchPlanOf({
    mode: lobby.mode,
    scheduledAt,
    range: seatRangeOf(lobby.mode, lobby.theatre),
    now,
    caller: meRow?.id ?? null,
    seats: lobby.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      ready: player.ready,
      seenAt: player.seenAt,
    })),
  });
  const status = statusOf({ lobby, plan, now, founderNick, entering });

  const copy = (what: 'link' | 'code') =>
    void navigator.clipboard
      .writeText(what === 'code' ? lobby.code : invitationUrl(window.location.origin, lobby.code))
      .then(() =>
        notify(what === 'code' ? fr.table.codeCopied(lobby.code) : fr.table.linkCopied, 'info'),
      );

  const slots: Array<Player | null> = Array.from(
    { length: Math.max(lobby.maximum, lobby.players.length) },
    (_, rank) => lobby.players[rank] ?? null,
  );
  if (entering) slots.splice(lobby.players.length);
  const half = Math.ceil(slots.length / 2);

  const quit = () => {
    forgetSeat();
    void navigate({ to: '/accueil' });
  };

  return (
    <div className="salon v2" data-view={view}>
      <header className="reglette">
        <Wordmark size={19} />
        <span className="sep" />
        <div>
          <div className="eyebrow">
            {fr.table.lobbyOf(fr.modes[lobby.mode].name, clockLabel(lobby.durationHours))}
          </div>
          <div className="code" aria-label={fr.table.codeLabel}>
            {lobby.code}
          </div>
        </div>
        {blitz ? (
          <div
            className="rdv"
            role="timer"
            aria-label={
              scheduledAt === null
                ? fr.table.whenFull
                : fr.table.rendezvousAria(
                    rendezvousLabel(scheduledAt, now),
                    countdownLabel(scheduledAt - now),
                  )
            }
          >
            {scheduledAt !== null && <Clock at={scheduledAt} />}
            <div>
              <div className="eyebrow">{fr.table.rendezvousOn(theatreName(lobby.theatre))}</div>
              <div className="when">
                {scheduledAt === null ? fr.table.whenFull : rendezvousLabel(scheduledAt, now)}
              </div>
            </div>
            {scheduledAt !== null && open && (
              <div className="big num">{countdownLabel(Math.max(0, scheduledAt - now))}</div>
            )}
          </div>
        ) : (
          <div className="rdv">
            <div>
              <div className="eyebrow">{fr.table.worldClock}</div>
              <div className="when">
                {fr.table.captureLine(lobby.orders.hqCaptureHours ?? HQ_CAPTURE_HOURS[0])}
              </div>
            </div>
          </div>
        )}
        <div className="tail">
          <div className="invwrap">
            {open && free > 0 ? (
              <button
                type="button"
                className="btn small"
                aria-expanded={inviteOpen}
                onClick={() => setInviteOpen(!inviteOpen)}
              >
                {fr.table.invite(free)}
              </button>
            ) : open ? (
              <span className="chip">{fr.table.full}</span>
            ) : null}
            {inviteOpen && (
              <div className="invpop" role="dialog" aria-label={fr.table.inviteLabel}>
                <div className="eyebrow">{fr.table.onlySecret}</div>
                <div className="codebig num">{lobby.code}</div>
                <div className="row">
                  <button type="button" className="btn small primary" onClick={() => copy('link')}>
                    {fr.table.copyLink}
                  </button>
                  <button type="button" className="btn small" onClick={() => copy('code')}>
                    {fr.table.copyCode}
                  </button>
                </div>
              </div>
            )}
          </div>
          <button type="button" className="btn small ghost" onClick={quit}>
            {fr.lobby.quit}
          </button>
        </div>
      </header>

      <div className="mtabs" role="tablist" aria-label={fr.table.sections}>
        {(['table', 'ordre', 'wire'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view === tab}
            onClick={() => setView(tab)}
          >
            {fr.table.tabs[tab]}
          </button>
        ))}
      </div>

      <aside className="col left">
        <Orders
          lobby={lobby}
          editing={editing && open}
          founder={founder && open}
          founderNick={founderNick}
          now={now}
          onEdit={() => setEditing(!editing)}
          offered={offered}
          change={change}
          onDestroy={() =>
            act(async () => {
              await destroy(seat);
              forgetSeat();
              void navigate({ to: '/accueil' });
            })
          }
        />
      </aside>

      <section className="desk-table" aria-label={fr.table.tableLabel}>
        <div
          className="seats top"
          role="list"
          style={{ gridTemplateColumns: `repeat(${half},1fr)` }}
        >
          {slots.slice(0, half).map((player, rank) => (
            <SeatCard
              key={player?.id ?? `free${rank}`}
              player={player}
              lobby={lobby}
              now={now}
              me={meRow}
              onOffer={() => copy('link')}
            />
          ))}
        </div>
        <TableMap
          lobby={lobby}
          editing={editing && founder && open && blitz}
          onTheatre={(next) => change({ theatre: next }, theatreName(next))}
          offered={(next) => offered({ theatre: next })}
          theatreBox={theatre === null ? null : boxOf(theatre.box)}
          meNation={lobby.me.nation}
        />
        <div
          className="seats bottom"
          role="list"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, slots.length - half)},1fr)` }}
        >
          {slots.slice(half).map((player, rank) => (
            <SeatCard
              key={player?.id ?? `free${half + rank}`}
              player={player}
              lobby={lobby}
              now={now}
              me={meRow}
              onOffer={() => copy('link')}
            />
          ))}
        </div>

        <section className="myplace" aria-labelledby="t-me">
          <div className="mp-main">
            <div className="lab">
              <span className="eyebrow" id="t-me">
                {blitz ? fr.table.yourFlag : fr.table.yourNation}
              </span>
              <span className="note">{blitz ? fr.table.identical : fr.table.firstCome}</span>
            </div>
            <div className="tokens" role="radiogroup" aria-labelledby="t-me">
              {NATIONS.map((nation) => {
                const holder = lobby.players.find(
                  (player) => player.nation === nation && player !== meRow,
                );
                const mine = lobby.me.nation === nation;
                return (
                  <button
                    key={nation}
                    type="button"
                    className={`token ${holder ? 'taken' : ''}`}
                    role="radio"
                    aria-checked={mine}
                    aria-disabled={holder ? true : undefined}
                    title={holder ? fr.table.takenBy(holder.nickname) : fr.nations[nation]}
                    onClick={() =>
                      holder
                        ? notify(fr.table.takenBy(holder.nickname), 'info')
                        : act(() => reserve({ ...seat, nation: mine ? null : nation }))
                    }
                  >
                    <FlagChip nation={nation} width={36} />
                    <span>{fr.table.shortNation[nation]}</span>
                    {holder && <em>{holder.nickname}</em>}
                  </button>
                );
              })}
            </div>
            {!blitz && isNation(lobby.me.nation) && (
              <div className="nfiche">
                <b>{fr.nationAssets[lobby.me.nation].name}</b>
                <span className="rule-broken">
                  <em>{fr.nationAssets[lobby.me.nation].rule}.</em>
                  {lobby.me.nation === 'usa' && (
                    <>
                      {' '}
                      <span className="chip" style={{ color: 'var(--notable-paper)' }}>
                        {fr.lobby.toBalance}
                      </span>
                    </>
                  )}
                </span>
                <RestField seat={seat} declared={lobby.me.restWindow} onError={setError} />
              </div>
            )}
          </div>
          <div className="acts">
            {entering ? (
              <button
                type="button"
                className="btn alarm"
                aria-disabled={lobby.me.nation === null || undefined}
                onClick={() =>
                  lobby.me.nation === null
                    ? notify(fr.table.chooseFirst(false), 'info')
                    : act(() => enterWar(seat))
                }
              >
                {fr.lobby.enterWar}
              </button>
            ) : (
              <>
                {lobby.me.nation !== null ? (
                  <button
                    type="button"
                    className={`btn ${lobby.me.ready ? 'primary' : ''}`}
                    aria-pressed={lobby.me.ready}
                    onClick={() => act(() => declareReady({ ...seat, ready: !lobby.me.ready }))}
                  >
                    {lobby.me.ready ? fr.table.readyLift : fr.table.readyStamp}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    aria-disabled
                    onClick={() => notify(fr.table.chooseFirst(blitz), 'info')}
                  >
                    {fr.table.chooseFirst(blitz)}
                  </button>
                )}
                {founder && open && (
                  <button
                    type="button"
                    className="btn alarm"
                    aria-disabled={plan.refusal !== null || undefined}
                    onClick={() =>
                      plan.refusal !== null ? notify(status, 'info') : act(() => launch(seat))
                    }
                  >
                    {blitz ? fr.table.launchBlitz : fr.table.launchSeason}
                  </button>
                )}
              </>
            )}
            <p className="status" aria-live="polite">
              {status}
            </p>
          </div>
          {(error ?? (open && lobby.launchRefusal !== null)) && (
            <p role="alert" className="wire-note" style={{ gridColumn: '1 / -1', margin: 0 }}>
              {error ?? (lobby.launchRefusal === null ? '' : fr.errors[lobby.launchRefusal]())}
            </p>
          )}
        </section>
      </section>

      <aside className="col right">
        {open && <Wire seat={seat} shown={wireOpen || view === 'wire'} onShown={setWireOpen} />}
      </aside>
    </div>
  );
}

/** **Une phrase plutôt qu'une liste** : qui ou quoi la table attend encore. */
function statusOf({
  lobby,
  plan,
  now,
  founderNick,
  entering,
}: {
  lobby: LobbyView;
  plan: { readonly refusal: string | null };
  now: number;
  founderNick: string;
  entering: boolean;
}): string {
  const blitz = lobby.mode === 'blitz';
  if (entering)
    return lobby.me.nation === null ? fr.table.chooseFirst(false) : fr.lobby.enterWarSeedNote;
  if (lobby.status !== 'lobby') return '';
  if (plan.refusal === null) {
    return lobby.me.creator ? fr.table.allReadyYou : fr.table.allReadyFounder(founderNick);
  }
  const parts: string[] = [];
  for (const player of lobby.players) {
    if (player.nation !== null) continue;
    parts.push(
      player.mine ? fr.table.waitYourNation(blitz) : fr.table.waitNationOf(player.nickname, blitz),
    );
  }
  const absent = blitz
    ? lobby.players.filter((player) => presenceOf(player.seenAt, now).kind === 'away')
    : [];
  for (const player of absent) parts.push(fr.table.waitAtTable(player.nickname));
  const notReady = lobby.players.filter((player) => !player.ready && player.nation !== null).length;
  if (notReady > 0) parts.push(fr.table.waitReady(notReady));
  if (lobby.players.length < seatRangeOf(lobby.mode, lobby.theatre).min)
    parts.push(fr.table.waitSecond);
  const scheduledAt = lobby.orders.scheduledAt;
  const tail =
    blitz && lobby.me.creator && absent.length > 0
      ? scheduledAt !== null && now >= scheduledAt
        ? fr.table.hourCome
        : scheduledAt !== null
          ? fr.table.withoutAbsents(fr.table.hour(scheduledAt))
          : fr.table.setAnHour
      : '';
  return `${fr.table.waitingFor(parts)}${tail}`;
}

function Clock({ at }: { at: number }) {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hourHand = (((hours % 12) + minutes / 60) * 30 * Math.PI) / 180;
  const minuteHand = (minutes * 6 * Math.PI) / 180;
  return (
    <svg viewBox="-20 -20 40 40" aria-hidden>
      <circle r={17} fill="none" stroke="currentColor" strokeWidth={1.6} />
      {Array.from({ length: 12 }, (_, tick) => {
        const a = (tick * Math.PI) / 6;
        return (
          <line
            key={tick}
            x1={Math.sin(a) * 14}
            y1={-Math.cos(a) * 14}
            x2={Math.sin(a) * 16}
            y2={-Math.cos(a) * 16}
            stroke="currentColor"
            strokeWidth={tick % 3 ? 0.8 : 1.6}
          />
        );
      })}
      <line
        x2={Math.sin(hourHand) * 8}
        y2={-Math.cos(hourHand) * 8}
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <line
        x2={Math.sin(minuteHand) * 12.5}
        y2={-Math.cos(minuteHand) * 12.5}
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      <circle r={1.6} fill="currentColor" />
    </svg>
  );
}

function SeatCard({
  player,
  lobby,
  now,
  me,
  onOffer,
}: {
  player: Player | null;
  lobby: LobbyView;
  now: number;
  me: Player | undefined;
  onOffer: () => void;
}) {
  if (player === null) {
    return (
      <div className="seat empty" role="listitem">
        <b>{fr.table.freeSeat}</b>
        <button type="button" className="link" onClick={onOffer}>
          {fr.table.offerLink}
        </button>
      </div>
    );
  }
  const blitz = lobby.mode === 'blitz';
  const mine = player === me;
  const presence = presenceOf(player.seenAt, now);
  const away = blitz && presence.kind === 'away';
  const sprite = spriteUrl(player.nation, 'infantry', 1);
  const offset = -new Date(now).getTimezoneOffset();
  const rest = fr.table.restRange(
    toLocalMinutes(player.restWindow.startMinutes, offset),
    toLocalMinutes(player.restWindow.endMinutes, offset),
  );
  const asset = isNation(player.nation) ? fr.nationAssets[player.nation] : null;
  const tags = [mine && fr.table.you, player.creator && fr.lobby.founder]
    .filter(Boolean)
    .join(' · ');
  const label = fr.table.seatAria({
    nickname: player.nickname,
    mine,
    founder: player.creator,
    nation: player.nation === null ? null : nationLabel(player.nation),
    blitz,
    presence: blitz ? (presence.kind === 'away' ? fr.table.away : fr.table.atTable) : rest,
    ready: player.ready,
  });
  return (
    <div
      className={`seat ${mine ? 'me' : ''} ${away ? 'away' : ''}`}
      role="listitem"
      aria-label={label}
      title={
        blitz ? undefined : `${rest}${asset === null ? '' : ` · ${asset.name} : ${asset.rule}`}`
      }
    >
      {tags && <span className="seat-tag">{tags}</span>}
      {sprite !== null ? (
        <>
          <img className="fig" src={sprite} alt="" />
          <span className="contact" />
        </>
      ) : (
        <span className="fig ghost" aria-hidden>
          ?
        </span>
      )}
      <div className="who">
        <b>{player.nickname}</b>
      </div>
      <div className="what">
        <FlagChip nation={player.nation} width={16} />{' '}
        {player.nation !== null ? nationLabel(player.nation) : <i>{fr.table.toChoose(blitz)}</i>}
      </div>
      {blitz && lobby.status === 'lobby' ? (
        <div className="state">
          <span className={`lamp ${away ? 'off' : 'on'}`} aria-hidden />{' '}
          {presence.kind === 'away' ? fr.table.awayFor(presence.minutes) : fr.table.atTable}
        </div>
      ) : asset !== null ? (
        <div className="atout">{asset.name}</div>
      ) : null}
      {player.ready && lobby.status === 'lobby' && (
        <span className="stamp" aria-hidden>
          {fr.table.ready}
        </span>
      )}
    </div>
  );
}

function TableMap({
  lobby,
  editing,
  onTheatre,
  offered,
  theatreBox,
  meNation,
}: {
  lobby: LobbyView;
  editing: boolean;
  onTheatre: (theatre: string) => void;
  offered: (theatre: string) => boolean;
  theatreBox: readonly [number, number, number, number] | null;
  meNation: string | null;
}) {
  const blitz = lobby.mode === 'blitz' && theatreBox !== null;
  const box = theatreBox ?? WORLD_BOX;
  const box2 = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = box2.current;
    if (element === null) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const held = lobby.players.filter((player) => isNation(player.nation));
  const sheet =
    blitz && lobby.theatre !== null ? fr.table.sheets[lobby.theatre as TheatreId] : null;
  return (
    <div className="tablemap">
      <div className="mapbox" ref={box2}>
        <EngravedMap
          box={box}
          px={780}
          frame={blitz ? box : undefined}
          veil={0.3}
          pad={blitz ? 0.04 : 0.01}
          flat={!blitz}
          gratStep={blitz ? 5 : 15}
          rings={blitz ? [16, 11.5, 7.5, 4.2, 1.9] : [9, 5.5, 2.6]}
          nations={
            blitz
              ? {}
              : Object.fromEntries(
                  held.map((player) => [player.nation!, { mine: player.nation === meNation }]),
                )
          }
          labels={sheet?.seas ?? fr.table.worldSeas}
          labelPx={blitz ? 19 : 15}
        />
      </div>
      {editing && (
        <div className="thswitch" role="radiogroup" aria-label={fr.found.theatreTitle}>
          {[...THEATRES.map((theatre) => theatre.id as string), THEATRE_DRAW]
            .filter((id) => offered(id) || id === lobby.theatre)
            .map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={lobby.theatre === id}
                onClick={() => lobby.theatre !== id && onTheatre(id)}
              >
                {theatreName(id)}
              </button>
            ))}
        </div>
      )}
      <div className="cartouche">
        <div className="eyebrow">
          {sheet === null ? fr.table.generalMap : fr.table.staffSheet(sheet.sheet)}
        </div>
        <h4>{sheet === null ? fr.table.world1940 : sheet.title}</h4>
        <div className="scale">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="scaletxt">{sheet === null ? fr.table.worldKm : sheet.km}</div>
      </div>
      <CompassRoseMark />
      {!blitz && size !== null && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        >
          {held.map((player) => {
            const capital = CAPITALS[player.nation!];
            if (capital === undefined) return null;
            const [x, y] = projectOn(WORLD_BOX, size, capital[0], capital[1], {
              pad: 0.01,
              flat: true,
            });
            return (
              <div
                key={player.id}
                className={`capital ${player.nation === meNation ? 'mine' : ''}`}
                style={{ left: x, top: y }}
              >
                <FlagChip nation={player.nation} width={22} />
                <i />
                <u />
              </div>
            );
          })}
        </div>
      )}
      <div className="mapnote">
        {lobby.mode === 'blitz' ? fr.table.postsDrawn : fr.table.nationsInk}
      </div>
    </div>
  );
}

function Orders({
  lobby,
  editing,
  founder,
  founderNick,
  now,
  onEdit,
  offered,
  change,
  onDestroy,
}: {
  lobby: LobbyView;
  editing: boolean;
  founder: boolean;
  founderNick: string;
  now: number;
  onEdit: () => void;
  offered: (change: Partial<Settings>) => boolean;
  change: (patch: Partial<Settings>, say: string) => void;
  onDestroy: () => void;
}) {
  const blitz = lobby.mode === 'blitz';
  const scheduledAt = lobby.orders.scheduledAt;
  const capture = lobby.orders.hqCaptureHours ?? HQ_CAPTURE_HOURS[0];
  const range = seatRangeOf(lobby.mode, lobby.theatre);
  const evening = nextEvening(new Date(now));
  const seatStepper = (
    <div className="stepper compact">
      <button
        type="button"
        aria-label={fr.table.seatLess}
        onClick={() =>
          offered({ seatCap: lobby.maximum - 1 }) &&
          change({ seatCap: lobby.maximum - 1 }, fr.found.seats(lobby.maximum - 1))
        }
      >
        −
      </button>
      <output>{lobby.maximum}</output>
      <button
        type="button"
        aria-label={fr.table.seatMore}
        onClick={() =>
          lobby.maximum < range.max &&
          change({ seatCap: lobby.maximum + 1 }, fr.found.seats(lobby.maximum + 1))
        }
      >
        +
      </button>
    </div>
  );
  const rendezvousChoices: ReadonlyArray<readonly [string, number | null]> = [
    [rendezvousLabel(evening, now), evening],
    [rendezvousLabel(evening + 86_400_000, now), evening + 86_400_000],
    [fr.found.full, null],
  ];
  const lines: ReadonlyArray<readonly [string, ReactNode]> = blitz
    ? [
        [
          fr.table.theatre,
          <>
            <b>{theatreName(lobby.theatre)}</b>
            {editing && <span className="note">{fr.table.onTheMap}</span>}
          </>,
        ],
        [
          fr.table.rendezvous,
          editing ? (
            <div className="edit">
              <div className="segm compact" role="radiogroup" aria-label={fr.table.rendezvous}>
                {rendezvousChoices.map(([label, at]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={scheduledAt === at}
                    onClick={() => scheduledAt !== at && change({ scheduledAt: at }, label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {scheduledAt !== null && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={lobby.orders.remind === true}
                    onChange={(event) =>
                      change(
                        { remind: event.target.checked },
                        event.target.checked ? fr.table.remindOn : fr.table.remindOff,
                      )
                    }
                  />
                  {fr.table.remindShort}
                </label>
              )}
            </div>
          ) : (
            <>
              <b>{scheduledAt === null ? fr.table.whenFull : rendezvousLabel(scheduledAt, now)}</b>
              {scheduledAt !== null && lobby.orders.remind === true && (
                <span className="note">{fr.table.remindShort}</span>
              )}
            </>
          ),
        ],
        [
          fr.table.seatsTerm,
          editing ? seatStepper : <b>{fr.table.seatsOf(lobby.players.length, lobby.maximum)}</b>,
        ],
        [fr.table.victory, fr.table.blitzVictory],
      ]
    : [
        [
          fr.table.hqCapture,
          editing ? (
            <div className="segm compact" role="radiogroup" aria-label={fr.table.hqCapture}>
              {HQ_CAPTURE_HOURS.map((hours) => (
                <button
                  key={hours}
                  type="button"
                  role="radio"
                  aria-checked={capture === hours}
                  onClick={() =>
                    capture !== hours && change({ hqCaptureHours: hours }, fr.found.hours(hours))
                  }
                >
                  {fr.found.hours(hours)}
                </button>
              ))}
            </div>
          ) : (
            <>
              <b>{fr.found.hours(capture)}</b>
              <span className="note">{fr.table.captureRest}</span>
            </>
          ),
        ],
        [
          fr.table.seatsTerm,
          editing ? seatStepper : <b>{fr.table.seatsOf(lobby.players.length, lobby.maximum)}</b>,
        ],
      ];
  const more = blitz ? fr.table.blitzMore : fr.table.mondialeMore(founder ? null : founderNick);
  return (
    <section className="panel orders" aria-labelledby="t-ord">
      <div className="ph">
        <h3 id="t-ord">{fr.found.title}</h3>
        {founder ? (
          <button type="button" className="link" onClick={onEdit}>
            {editing ? fr.table.done : fr.table.edit}
          </button>
        ) : (
          <span className="note">{fr.table.by(founderNick)}</span>
        )}
      </div>
      <dl>
        {lines.map(([term, value]) => (
          <OrderLine key={term} term={term} value={value} />
        ))}
      </dl>
      {editing && (
        <p className="note" style={{ margin: '8px 0 0' }}>
          {fr.table.liftsReady}
        </p>
      )}
      <details className="more">
        <summary>{fr.table.wholeOrder}</summary>
        <dl>
          {more.map(([term, value]) => (
            <OrderLine key={term} term={term} value={value} />
          ))}
        </dl>
        {founder && (
          <DestroyButton
            label={fr.lobby.destroy}
            confirm={fr.lobby.destroyConfirm}
            note={fr.lobby.destroyNote}
            onDestroy={onDestroy}
          />
        )}
      </details>
    </section>
  );
}

function OrderLine({ term, value }: { term: string; value: ReactNode }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}

/**
 * **Le télégraphe du salon est le widget du jeu** (`TelegraphPanel`), posé dans une fenêtre à
 * part : repliée, une bande qui montre le dernier message et le nombre de non-lus. Le fil du
 * salon est le sien, effacé au lancement (`messages.lobby`). La lecture se date en repliant et en
 * quittant la feuille.
 */
function Wire({
  seat,
  shown,
  onShown,
}: {
  seat: Seat;
  shown: boolean;
  onShown: (shown: boolean) => void;
}) {
  const telegraph = useTelegraph(seat);
  const tabs = useTelegraphTabs(telegraph, seat);
  useReadOnUnmount(tabs.leave);
  const last = telegraph.general.at(-1);
  if (!shown) {
    return (
      <button
        type="button"
        className="wiretab"
        aria-label={fr.table.openWire(telegraph.unread)}
        onClick={() => onShown(true)}
      >
        <span className="t">{fr.telegraph.header}</span>
        {telegraph.unread > 0 ? <span className="badge">{telegraph.unread}</span> : <span />}
        <span className="last">
          {last === undefined ? (
            fr.table.wireSilent
          ) : (
            <>
              <b>{last.nickname}</b> {last.text}
            </>
          )}
        </span>
        <span className="open">{fr.table.open}</span>
      </button>
    );
  }
  return (
    <section className="wirewin" aria-label={fr.telegraph.header}>
      <header className="wbar">
        <span className="eyebrow">{fr.telegraph.header}</span>
        <span className="ctitle">
          {tabs.channel === undefined
            ? fr.table.generalChannel
            : fr.table.privateWith(tabs.channel.nickname)}
        </span>
        <button
          type="button"
          className="wclose"
          aria-label={fr.table.foldWire}
          onClick={() => {
            tabs.leave();
            onShown(false);
          }}
        >
          {fr.table.fold}
        </button>
      </header>
      <p className="wcanal">{fr.telegraph.lobbyChannel}</p>
      <div className="flex min-h-0 flex-col">
        <TelegraphPanel
          telegraph={telegraph}
          tabs={tabs}
          seat={seat}
          height="fill"
          inset="px-3 pb-2"
        />
      </div>
    </section>
  );
}

/** La plage de repos se déclare à sa montre et se juge en UTC ; elle se scelle au lancement. */
function RestField({
  seat,
  declared,
  onError,
}: {
  seat: Seat;
  declared: { startMinutes: number; endMinutes: number };
  onError: (message: string | null) => void;
}) {
  const setRestWindow = useMutation(api.players.setRestWindow);
  const offset = -new Date().getTimezoneOffset();
  const start = toLocalMinutes(declared.startMinutes, offset);
  const end = toLocalMinutes(declared.endMinutes, offset);
  return (
    <span className="rest">
      <span>{fr.table.restFrom}</span>
      <input
        type="time"
        aria-label={fr.table.restLabel}
        defaultValue={fr.table.clock(start)}
        onChange={(event) => {
          const [hours = '0', minutes = '0'] = event.target.value.split(':');
          const local = Number(hours) * 60 + Number(minutes);
          if (Number.isNaN(local)) return;
          onError(null);
          setRestWindow({ ...seat, startMinutes: toUtcMinutes(local, offset) }).catch(
            (problem: unknown) => handleError(problem, (message) => onError(message)),
          );
        }}
      />
      <span className="note">{fr.table.restUntil(fr.table.clock(end))}</span>
    </span>
  );
}
