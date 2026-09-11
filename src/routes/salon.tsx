import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { fr, clockLabel, nationLabel } from '@/i18n/fr';
import { ThickRule, ThickRuleInverse, Newspaper, usePageTurn } from '@/shell/Newspaper';
import { Wordmark } from '@/shell/Masthead';
import { NATIONS } from '@/domain/nations';
import type { PlayableRegion } from '@/domain/ids';
import { FlagBanner, Flag } from '@/emblems/Flag';
import { convexClient } from '@/data/convexClient';
import { errorCode, handleError } from '@/data/errors';
import { forgetSeat, useSeat, type Seat } from '@/data/session';
import { DestroyButton } from '@/shell/DestroyButton';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleSeat } from '@/shell/StaleSeat';
import { LaunchSequence } from '@/shell/LaunchSequence';
import { TelegraphThread } from '@/shell/TelegraphThread';
import { useTelegraph } from '@/data/telegraph';
import { asDayAndTime } from '@/domain/duration';
import { REGISTRATION_WINDOW_HOURS } from '@/domain/off-season';

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

const WIDTH = 760;

function Lobby() {
  const seat = useSeat();
  if (!convexClient || !seat) return <Navigate to="/accueil" />;
  return <ConnectedLobby seat={seat} />;
}

function ConnectedLobby({ seat }: { seat: Seat }) {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
  const lobby = useQuery(api.seasons.lobby, seat);
  const reserve = useMutation(api.players.reserveNation);
  const declareReady = useMutation(api.players.declareReady);
  const launch = useMutation(api.seasons.launch);
  const enterWar = useMutation(api.seasons.enterWar);
  const destroy = useMutation(api.seasons.destroy);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toBoard = useCallback(() => void navigate({ to: '/plateau' }), [navigate]);

  if (lobby === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--desk)]">
        <span className="eyebrow-dark">{fr.lobby.opening}</span>
      </div>
    );
  }

  const act = (action: () => Promise<unknown>) => {
    setError(null);
    action().catch((problem: unknown) => handleError(problem, setError));
  };
  const holderOf = (nation: string) => lobby.players.find((player) => player.nation === nation);
  const allReady = lobby.players.length >= 2 && lobby.players.every((player) => player.ready);
  const pace = clockLabel(lobby.durationHours);
  /**
   * **The two faces of this screen.** A season already running and a player who has not entered
   * it is a latecomer: he picks a flag on a board that is being fought over, then enters — no
   * "ready", nobody to wait for, no relaunch (`seasons.enterWar`). Once he is a belligerent the
   * same launched status means the opposite: walk onto the board.
   */
  const entering = lobby.status === 'launched' && !lobby.me.atWar;
  const launching = lobby.status === 'launched' && lobby.me.atWar;
  const regionName =
    fr.playableRegions[lobby.playableRegion as PlayableRegion] ?? lobby.playableRegion;

  const checks = [
    { label: fr.lobby.checkNation, done: lobby.me.nation !== null },
    ...(entering ? [] : [{ label: fr.lobby.checkAllReady, done: allReady }]),
  ];
  const missing = checks.filter((check) => !check.done).length;
  const freeSeats = entering ? 0 : Math.min(2, 8 - lobby.players.length);
  const freeNations = NATIONS.filter((nation) => holderOf(nation) === undefined).length;
  const registrationNote =
    lobby.status === 'lobby'
      ? fr.lobby.registrationBeforeLaunch(REGISTRATION_WINDOW_HOURS)
      : lobby.registrationClosesAt === null
        ? lobby.status === 'concluded'
          ? fr.lobby.registrationConcluded
          : fr.lobby.registrationClosed
        : fr.lobby.registrationUntil(asDayAndTime(lobby.registrationClosesAt));

  const copyCode = () => {
    void navigator.clipboard.writeText(lobby.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <>
      <div className="h-full">
        <Newspaper width={WIDTH} turning={turning}>
          <div className="paper-grain @container relative border border-[var(--ink)] text-[var(--ink)] shadow-[0_20px_46px_rgba(0,0,0,.6),0_2px_0_rgba(0,0,0,.5)]">
            <div className="flex flex-wrap items-center gap-x-[14px] gap-y-1 px-[30px] pt-3 pb-[10px]">
              {/* La manchette réduite : le salon est une feuille du même journal que l'accueil,
                  et c'est la seule chose qui le dit une fois la page tournée. */}
              <Wordmark size={17} />
              <span aria-hidden className="h-[22px] w-px bg-[rgba(42,33,24,.35)]" />
              <Flag nation={lobby.me.nation} width={33} onPaper />
              <span className="font-(family-name:--font-display) text-[17px] font-extrabold tracking-[.02em] uppercase">
                {nationLabel(lobby.me.nation)}
              </span>
              <span className="flex-1" />
              <span className="eyebrow">
                {entering ? fr.lobby.enterWarHeader : fr.lobby.header(pace)}
              </span>
              <span className="eyebrow">{fr.lobby.regionLabel(regionName)}</span>
              <button
                type="button"
                onClick={() => {
                  forgetSeat();
                  turn(() => void navigate({ to: '/accueil' }));
                }}
                className="cursor-pointer border border-[rgba(42,33,24,.55)] px-[13px] py-[6px] text-[10px] tracking-[.2em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
              >
                {fr.lobby.quit}
              </button>
            </div>

            <ThickRule />

            <div className="flex flex-wrap items-center gap-[26px] px-[30px] pt-[18px] pb-4">
              <div className="min-w-0 flex-1">
                <div className="eyebrow">{fr.lobby.codeLabel}</div>
                <div className="font-(family-name:--font-display) text-[clamp(34px,6.6cqi,68px)] leading-[1.04] font-extrabold tracking-[.22em]">
                  {lobby.code}
                </div>
                <div className="text-[11.5px] text-[var(--ink-note)]">{fr.lobby.codeNote}</div>
                <div className="mt-1 text-[11.5px] text-[var(--ink-note)]">{registrationNote}</div>
              </div>
              <div className="flex w-[200px] shrink-0 flex-col gap-2">
                <button
                  type="button"
                  onClick={copyCode}
                  className="cursor-pointer border border-[var(--ink)] p-[10px] text-[10px] tracking-[.2em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
                >
                  {copied ? fr.lobby.codeCopied : fr.lobby.copyCode}
                </button>
                <div className="text-center font-(family-name:--font-mono) text-[10px] tracking-[.1em] text-[var(--ink-faint)]">
                  {fr.lobby.participantCount(lobby.players.length)}
                </div>
              </div>
            </div>

            <ThickRuleInverse />

            <div className="mx-[30px] flex flex-col @2xl:flex-row @2xl:items-stretch">
              <section className="min-w-0 flex-1 pt-4 pb-2 @2xl:pr-[26px]">
                <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[7px]">
                  <span className="eyebrow">
                    {entering ? fr.lobby.enterWarNationsHeader : fr.lobby.nationsHeader}
                  </span>
                  <span className="text-[10.5px] text-[var(--ink-faint)]">
                    {fr.lobby.nationsFree(freeNations)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-[9px] @md:grid-cols-3 @2xl:grid-cols-4">
                  {NATIONS.map((nation) => {
                    const holder = holderOf(nation);
                    const isMine = lobby.me.nation === nation;
                    const taken = holder !== undefined && !isMine;
                    return (
                      <button
                        key={nation}
                        type="button"
                        onClick={() =>
                          act(() => reserve({ ...seat, nation: isMine ? null : nation }))
                        }
                        disabled={taken}
                        title={fr.nationPowers[nation]}
                        className={`block border border-[var(--ink)] bg-[var(--paper)] text-left transition-transform duration-100 ${
                          isMine
                            ? 'shadow-[0_6px_14px_rgba(0,0,0,.3)] outline-2 outline-offset-1 outline-[var(--notable)] -translate-y-[2px] cursor-pointer'
                            : taken
                              ? 'cursor-not-allowed opacity-50'
                              : 'cursor-pointer hover:-translate-y-[1px]'
                        }`}
                      >
                        <span className="relative block">
                          <FlagBanner nation={nation} />
                          <span
                            aria-hidden
                            className="absolute inset-0"
                            style={{
                              background:
                                'linear-gradient(180deg, rgba(255,255,255,.08), rgba(23,18,8,.2))',
                            }}
                          />
                        </span>
                        <span className="block bg-[var(--ink)] px-2 pt-[6px] pb-[7px] text-[var(--paper)]">
                          <span className="block truncate text-[12px] font-semibold tracking-[.02em]">
                            {fr.nations[nation]}
                          </span>
                          <span
                            className="mt-[2px] block truncate text-[9px] tracking-[.14em] uppercase"
                            style={{ color: statusInk(isMine, holder !== undefined, nation) }}
                          >
                            {isMine
                              ? fr.lobby.you
                              : holder
                                ? fr.lobby.takenBy(holder.nickname)
                                : nation === 'usa'
                                  ? fr.lobby.toBalance
                                  : fr.lobby.free}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] leading-[1.55] text-[var(--ink-note)]">
                  {entering ? fr.lobby.enterWarNote : fr.lobby.reservationNote}
                </p>
              </section>

              <div
                aria-hidden
                className="hidden w-px @2xl:block"
                style={{
                  background:
                    'repeating-linear-gradient(180deg, var(--ink) 0 4px, transparent 4px 9px)',
                }}
              />

              <aside className="w-full pt-4 pb-2 @2xl:w-[290px] @2xl:shrink-0 @2xl:pl-[26px]">
                <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[7px]">
                  <span className="eyebrow">
                    {entering ? fr.lobby.belligerents : fr.lobby.playersHeader}
                  </span>
                  <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-faint)]">
                    {lobby.players.length} / 8
                  </span>
                </div>
                <ul className="mt-2 flex flex-col">
                  {lobby.players.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-[9px] border-b border-[rgba(42,33,24,.16)] px-[2px] py-[6px]"
                    >
                      <Flag nation={player.nation} width={18} onPaper />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {player.nickname}
                        {player.creator && (
                          <span className="ml-[6px] text-[9px] tracking-[.14em] text-[var(--ink-faint)] uppercase">
                            {fr.lobby.founder}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--ink-note)]">
                        {nationLabel(player.nation)}
                      </span>
                      <span
                        className="shrink-0 text-[9px] tracking-[.14em] uppercase"
                        style={{
                          color: (entering ? player.atWar : player.ready)
                            ? 'var(--valid)'
                            : 'var(--ink-faint)',
                        }}
                      >
                        {entering
                          ? player.atWar
                            ? fr.lobby.atWar
                            : fr.lobby.waiting
                          : player.ready
                            ? fr.lobby.ready
                            : fr.lobby.waiting}
                      </span>
                    </li>
                  ))}
                  {Array.from({ length: freeSeats }, (_, rank) => (
                    <li
                      key={`free-${rank}`}
                      className="flex items-center gap-[9px] border-b border-dashed border-[rgba(42,33,24,.28)] px-[2px] py-[6px] text-[var(--ink-faint)]"
                    >
                      <span
                        aria-hidden
                        className="h-[9px] w-[9px] border border-[rgba(42,33,24,.3)]"
                      />
                      <span className="text-[11px] tracking-[.14em] uppercase">
                        {fr.lobby.freeSeat}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="eyebrow mt-4 border-b border-[var(--ink)] pb-[7px]">
                  {fr.lobby.restHeader}
                </div>
                <RestWindowForm seat={seat} declared={lobby.me.restWindow} onError={setError} />
                <p className="mt-2 text-[11px] leading-[1.5] text-[var(--ink-note)]">
                  {fr.lobby.restNote}
                </p>

                <div className="mt-4 flex flex-col gap-1">
                  {checks.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center gap-[9px] text-[11.5px]"
                      style={{ color: check.done ? 'var(--ink)' : 'var(--ink-faint)' }}
                    >
                      <span className="w-[11px] font-(family-name:--font-mono) text-[11px]">
                        {check.done ? '×' : '·'}
                      </span>
                      <span>{check.label}</span>
                    </div>
                  ))}
                </div>

                {/**
                 * **Entering the war replaces "ready" and "launch" at once**: nobody is waiting
                 * for the latecomer and there is nothing left to launch. One button, in the same
                 * place as the founder's, owning the same irreversibility.
                 */}
                {entering ? (
                  <>
                    <button
                      type="button"
                      disabled={missing > 0}
                      onClick={() => act(() => enterWar(seat))}
                      className={`mt-[14px] w-full border p-[13px] text-[11px] tracking-[.22em] uppercase ${
                        missing === 0
                          ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
                          : 'cursor-not-allowed border-[rgba(42,33,24,.3)] bg-[rgba(42,33,24,.12)] text-[var(--ink-faint)]'
                      }`}
                    >
                      {fr.lobby.enterWar}
                    </button>
                    <p className="mt-[7px] text-center text-[10.5px] text-[var(--ink-faint)]">
                      {missing === 0
                        ? fr.lobby.enterWarSeedNote
                        : fr.lobby.enterWarMissing(missing)}
                    </p>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => act(() => declareReady({ ...seat, ready: !lobby.me.ready }))}
                    className={`mt-[14px] w-full cursor-pointer border border-[var(--ink)] p-[13px] text-[11px] tracking-[.22em] uppercase ${
                      lobby.me.ready
                        ? 'bg-[var(--ink)] text-[var(--paper)]'
                        : 'hover:bg-[rgba(42,33,24,.08)]'
                    }`}
                  >
                    {lobby.me.ready ? fr.lobby.declareNotReady : fr.lobby.declareReady}
                  </button>
                )}

                {entering ? null : lobby.me.creator ? (
                  <>
                    <button
                      type="button"
                      disabled={!allReady}
                      onClick={() => act(() => launch(seat))}
                      className={`mt-2 w-full border p-[13px] text-[11px] tracking-[.22em] uppercase ${
                        allReady
                          ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
                          : 'cursor-not-allowed border-[rgba(42,33,24,.3)] bg-[rgba(42,33,24,.12)] text-[var(--ink-faint)]'
                      }`}
                    >
                      {fr.lobby.launch}
                    </button>
                    <p className="mt-[7px] text-center text-[10.5px] text-[var(--ink-faint)]">
                      {allReady ? fr.lobby.launchSeedNote : fr.lobby.launchMissing(missing)}
                    </p>
                    <DestroyButton
                      label={fr.lobby.destroy}
                      confirm={fr.lobby.destroyConfirm}
                      note={fr.lobby.destroyNote}
                      onDestroy={() =>
                        act(async () => {
                          await destroy(seat);
                          forgetSeat();
                          turn(() => void navigate({ to: '/accueil' }));
                        })
                      }
                    />
                  </>
                ) : (
                  <p className="mt-[10px] text-center text-[10.5px] text-[var(--ink-faint)]">
                    {fr.lobby.creatorOnly}
                  </p>
                )}
              </aside>
            </div>

            <ThickRuleInverse />

            <LobbyTelegraph seat={seat} />

            {error && (
              <p className="mx-[30px] mt-4 border border-[var(--critical)] px-3 py-2 text-[12.5px]">
                {error}
              </p>
            )}

            <div className="mx-[30px] mt-[14px] flex items-center justify-between border-t border-[rgba(42,33,24,.35)] pt-[9px] pb-[14px] text-[10px] tracking-[.16em] text-[var(--ink-faint)] uppercase">
              <span>{entering ? fr.lobby.footerEnterWar : fr.lobby.footerLeft}</span>
              <span className="font-(family-name:--font-mono) tracking-[.12em]">
                {fr.lobby.footerCode(lobby.code)}
              </span>
            </div>
          </div>
        </Newspaper>
      </div>

      {launching && (
        <LaunchSequence
          region={regionName}
          pace={pace}
          players={lobby.players.length}
          onEnd={toBoard}
        />
      )}
    </>
  );
}

/**
 * **Le télégraphe du salon est posé, jamais ouvert.** C'est la raison d'être de l'écriture
 * acceptée dès le lobby (`convex/messages.ts`) : l'heure où l'on n'a rien à faire qu'attendre les
 * autres est celle où l'on se chambre. Pas de rail et pas de badge ici — il n'y a rien à ouvrir,
 * donc rien à compter.
 *
 * La lecture se date au **démontage** : la feuille les a montrés tant qu'elle était à l'écran, et
 * celui qui la quitte pour le plateau ne doit pas y retrouver un badge plein de ce qu'il vient de
 * lire. C'est la même règle que la fermeture d'une fenêtre, appliquée au seul geste qui existe
 * ici.
 */
function LobbyTelegraph({ seat }: { seat: Seat }) {
  const telegraph = useTelegraph(seat);
  const markRead = useMutation(api.messages.markRead);
  useEffect(
    () => () => {
      void markRead(seat).catch(() => undefined);
    },
    [markRead, seat],
  );

  return (
    <section className="mx-[30px] mt-4 flex flex-col">
      <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[7px]">
        <span className="eyebrow">{fr.telegraph.header}</span>
        <span className="text-[10.5px] text-[var(--ink-faint)]">{fr.telegraph.channel}</span>
      </div>
      <TelegraphThread telegraph={telegraph} seat={seat} height={220} />
    </section>
  );
}

/**
 * The rest window is declared here and nowhere else: it freezes at launch (see
 * `players.setRestWindow`), so the nation sheet only displays it afterwards. One field, not
 * two — the duration is fixed at seven hours, and the end is shown as the consequence of the
 * start rather than as a second thing to choose.
 */
function RestWindowForm({
  seat,
  declared,
  onError,
}: {
  seat: Seat;
  declared: { startMinutes: number; endMinutes: number };
  onError: (message: string | null) => void;
}) {
  const setRestWindow = useMutation(api.players.setRestWindow);
  const [start, setStart] = useState(() => asHtmlTime(declared.startMinutes));
  const [saved, setSaved] = useState(false);

  return (
    <div className="mt-[10px] flex flex-wrap items-center gap-2">
      <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.lobby.restFrom}</span>
      <input
        type="time"
        value={start}
        onChange={(event) => {
          setStart(event.target.value);
          setSaved(false);
        }}
        className="border border-[var(--ink)] bg-transparent px-2 py-[5px] font-(family-name:--font-mono) text-[13px] text-[var(--ink)] outline-none"
      />
      <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
        {fr.lobby.restUntil(asHtmlTime(endOf(asMinutes(start))))}
      </span>
      <button
        type="button"
        onClick={() => {
          onError(null);
          setRestWindow({ ...seat, startMinutes: asMinutes(start) })
            .then(() => setSaved(true))
            .catch((problem: unknown) => handleError(problem, onError));
        }}
        className="cursor-pointer border border-[var(--ink)] px-2 py-[6px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        {saved ? fr.lobby.restDeclared : fr.lobby.restDeclare}
      </button>
    </div>
  );
}

/** Mirrors `restWindowFrom` on the server: the preview must show what will be stored. */
const REST_WINDOW_MINUTES = 7 * 60;
const endOf = (startMinutes: number) => (startMinutes + REST_WINDOW_MINUTES) % 1440;

const asHtmlTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const asMinutes = (time: string) => {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
};

function statusInk(isMine: boolean, taken: boolean, nation: string): string {
  if (isMine) return 'var(--notable)';
  if (taken) return 'var(--critical)';
  if (nation === 'usa') return 'var(--notable)';
  return 'var(--paper-dim)';
}
