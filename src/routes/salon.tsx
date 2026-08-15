import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { fr, nationLabel } from '@/i18n/fr';
import { ThickRule, ThickRuleInverse, Newspaper, usePageTurn } from '@/shell/Newspaper';
import { DOCTRINES, NATIONS } from '@/domain/nations';
import type { PlayableRegion } from '@/domain/ids';
import { FlagBanner, Flag } from '@/emblems/Flag';
import { convexClient } from '@/data/convexClient';
import { errorCode, handleError } from '@/data/errors';
import { forgetToken, useToken } from '@/data/token';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { StaleToken } from '@/shell/StaleToken';
import { LaunchSequence } from '@/shell/LaunchSequence';

export const Route = createFileRoute('/salon')({
  component: Lobby,
  errorComponent: ({ error, reset }) => <LobbyError error={error} reset={reset} />,
});

/** A dead token at the lobby is no outage: drop it and go back home. */
function LobbyError({ error, reset }: { error: unknown; reset: () => void }) {
  const code = errorCode(error);
  if (code === 'UNKNOWN_TOKEN' || code === 'SEASON_GONE') return <StaleToken to="/accueil" />;
  return <ErrorScreen error={error} reset={reset} />;
}

const WIDTH = 760;
const NUMERALS = ['I', 'II', 'III'] as const;

function Lobby() {
  const token = useToken();
  if (!convexClient || !token) return <Navigate to="/accueil" />;
  return <ConnectedLobby token={token} />;
}

function ConnectedLobby({ token }: { token: string }) {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
  const lobby = useQuery(api.seasons.lobby, { token });
  const reserve = useMutation(api.players.reserveNation);
  const chooseDoctrine = useMutation(api.players.chooseDoctrine);
  const declareReady = useMutation(api.players.declareReady);
  const launch = useMutation(api.seasons.launch);
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
  const pace = lobby.durationHours === 48 ? fr.lobby.pace48 : fr.lobby.pace168;
  const launching = lobby.status === 'launched';
  const regionName =
    fr.playableRegions[lobby.playableRegion as PlayableRegion] ?? lobby.playableRegion;

  const checks = [
    { label: fr.lobby.checkNation, done: lobby.me.nation !== null },
    { label: fr.lobby.checkDoctrine, done: lobby.me.doctrine !== null },
    { label: fr.lobby.checkAllReady, done: allReady },
  ];
  const missing = checks.filter((check) => !check.done).length;
  const freeSeats = Math.min(2, 8 - lobby.players.length);
  const freeNations = NATIONS.filter((nation) => holderOf(nation) === undefined).length;

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
            <Flag nation={lobby.me.nation} width={33} onPaper />
            <span className="font-[var(--font-display)] text-[17px] font-extrabold tracking-[.02em] uppercase">
              {nationLabel(lobby.me.nation)}
            </span>
            <span className="flex-1" />
            <span className="eyebrow">{fr.lobby.header(pace)}</span>
            <span className="eyebrow">{fr.lobby.regionLabel(regionName)}</span>
            <button
              type="button"
              onClick={() => {
                forgetToken();
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
              <div className="font-[var(--font-display)] text-[clamp(34px,6.6cqi,68px)] leading-[1.04] font-extrabold tracking-[.22em]">
                {lobby.code}
              </div>
              <div className="text-[11.5px] text-[var(--ink-note)]">{fr.lobby.codeNote}</div>
            </div>
            <div className="flex w-[200px] shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={copyCode}
                className="cursor-pointer border border-[var(--ink)] p-[10px] text-[10px] tracking-[.2em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
              >
                {copied ? fr.lobby.codeCopied : fr.lobby.copyCode}
              </button>
              <div className="text-center font-[var(--font-mono)] text-[10px] tracking-[.1em] text-[var(--ink-faint)]">
                {fr.lobby.openCount(lobby.players.length)}
              </div>
            </div>
          </div>

          <ThickRuleInverse />

          <div className="mx-[30px] flex flex-col @2xl:flex-row @2xl:items-stretch">
            <section className="min-w-0 flex-1 pt-4 pb-2 @2xl:pr-[26px]">
              <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[7px]">
                <span className="eyebrow">{fr.lobby.nationsHeader}</span>
                <span className="text-[10.5px] text-[var(--ink-faint)]">{fr.lobby.nationsFree(freeNations)}</span>
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
                      onClick={() => act(() => reserve({ token, nation: isMine ? null : nation }))}
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
                {fr.lobby.reservationNote}
              </p>
            </section>

            <div
              aria-hidden
              className="hidden w-px @2xl:block"
              style={{
                background: 'repeating-linear-gradient(180deg, var(--ink) 0 4px, transparent 4px 9px)',
              }}
            />

            <aside className="w-full pt-4 pb-2 @2xl:w-[290px] @2xl:shrink-0 @2xl:pl-[26px]">
              <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[7px]">
                <span className="eyebrow">{fr.lobby.playersHeader}</span>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-faint)]">
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
                      style={{ color: player.ready ? 'var(--valid)' : 'var(--ink-faint)' }}
                    >
                      {player.ready ? fr.lobby.ready : fr.lobby.waiting}
                    </span>
                  </li>
                ))}
                {Array.from({ length: freeSeats }, (_, rank) => (
                  <li
                    key={`free-${rank}`}
                    className="flex items-center gap-[9px] border-b border-dashed border-[rgba(42,33,24,.28)] px-[2px] py-[6px] text-[var(--ink-faint)]"
                  >
                    <span aria-hidden className="h-[9px] w-[9px] border border-[rgba(42,33,24,.3)]" />
                    <span className="text-[11px] tracking-[.14em] uppercase">{fr.lobby.freeSeat}</span>
                  </li>
                ))}
              </ul>

              <div className="eyebrow mt-4 border-b border-[var(--ink)] pb-[7px]">
                {fr.lobby.doctrineHeader}
              </div>
              <div className="mt-[10px] flex gap-[6px]">
                {DOCTRINES.map((doctrine, rank) => (
                  <button
                    key={doctrine}
                    type="button"
                    onClick={() => act(() => chooseDoctrine({ token, doctrine }))}
                    className={`flex-1 cursor-pointer border border-[var(--ink)] px-2 py-[9px] text-center ${
                      lobby.me.doctrine === doctrine
                        ? 'bg-[var(--ink)] text-[var(--paper)]'
                        : 'hover:bg-[rgba(42,33,24,.08)]'
                    }`}
                  >
                    <span className="block font-[var(--font-mono)] text-[9px] opacity-60">
                      {NUMERALS[rank]}
                    </span>
                    <span className="mt-[3px] block text-[11px] tracking-[.08em] uppercase">
                      {fr.doctrines[doctrine]}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--ink-note)]">
                {fr.lobby.doctrineNote}
              </p>

              <div className="eyebrow mt-4 border-b border-[var(--ink)] pb-[7px]">
                {fr.lobby.restHeader}
              </div>
              <RestWindowForm token={token} declared={lobby.me.restWindow} onError={setError} />
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
                    <span className="w-[11px] font-[var(--font-mono)] text-[11px]">
                      {check.done ? '×' : '·'}
                    </span>
                    <span>{check.label}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => act(() => declareReady({ token, ready: !lobby.me.ready }))}
                className={`mt-[14px] w-full cursor-pointer border border-[var(--ink)] p-[13px] text-[11px] tracking-[.22em] uppercase ${
                  lobby.me.ready
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'hover:bg-[rgba(42,33,24,.08)]'
                }`}
              >
                {lobby.me.ready ? fr.lobby.declareNotReady : fr.lobby.declareReady}
              </button>

              {lobby.me.creator ? (
                <>
                  <button
                    type="button"
                    disabled={!allReady}
                    onClick={() => act(() => launch({ token }))}
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
                    onDestroy={() =>
                      act(async () => {
                        await destroy({ token });
                        forgetToken();
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

          {error && (
            <p className="mx-[30px] mt-4 border border-[var(--critical)] px-3 py-2 text-[12.5px]">
              {error}
            </p>
          )}

          <div className="mx-[30px] mt-[14px] flex items-center justify-between border-t border-[rgba(42,33,24,.35)] pt-[9px] pb-[14px] text-[10px] tracking-[.16em] text-[var(--ink-faint)] uppercase">
            <span>{fr.lobby.footerLeft}</span>
            <span className="font-[var(--font-mono)] tracking-[.12em]">{fr.lobby.footerCode(lobby.code)}</span>
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
 * Two clicks, and the second one is not the same button: destroying a season takes everyone's
 * game away, and a misclick next to "launch" would be the worst possible one. The cancel sits
 * where the first click was, so the reflex click lands on it.
 */
function DestroyButton({ onDestroy }: { onDestroy: () => void }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="mt-[10px] w-full cursor-pointer border border-[rgba(42,33,24,.3)] p-[9px] text-[10px] tracking-[.2em] text-[var(--ink-faint)] uppercase hover:border-[var(--critical)] hover:text-[var(--critical)]"
      >
        {fr.lobby.destroy}
      </button>
    );
  }

  return (
    <div className="mt-[10px] flex flex-col gap-[6px]">
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="w-full cursor-pointer border border-[var(--ink)] p-[9px] text-[10px] tracking-[.2em] uppercase hover:bg-[rgba(42,33,24,.08)]"
      >
        {fr.lobby.destroyCancel}
      </button>
      <button
        type="button"
        onClick={onDestroy}
        className="w-full cursor-pointer border border-[var(--critical)] bg-[var(--critical)] p-[9px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase"
      >
        {fr.lobby.destroyConfirm}
      </button>
      <p className="text-center text-[10.5px] text-[var(--critical)]">{fr.lobby.destroyNote}</p>
    </div>
  );
}

/**
 * The rest window is declared here and nowhere else: it freezes at launch (see
 * `players.setRestWindow`), so the nation sheet only displays it afterwards. One field, not
 * two — the duration is fixed at seven hours, and the end is shown as the consequence of the
 * start rather than as a second thing to choose.
 */
function RestWindowForm({
  token,
  declared,
  onError,
}: {
  token: string;
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
        className="border border-[var(--ink)] bg-transparent px-2 py-[5px] font-[var(--font-mono)] text-[13px] text-[var(--ink)] outline-none"
      />
      <span className="font-[var(--font-mono)] text-[11.5px] text-[var(--ink-soft)]">
        {fr.lobby.restUntil(asHtmlTime(endOf(asMinutes(start))))}
      </span>
      <button
        type="button"
        onClick={() => {
          onError(null);
          setRestWindow({ token, startMinutes: asMinutes(start) })
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
