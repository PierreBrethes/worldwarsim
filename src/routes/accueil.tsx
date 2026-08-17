import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../convex/_generated/api';
import { fr, doctrineLabel, nationLabel } from '@/i18n/fr';
import type { PlayableRegion } from '@/domain/ids';
import {
  ThickRule,
  ThickRuleInverse,
  Newspaper,
  usePageTurn,
  type Turning,
} from '@/shell/Newspaper';
import { LaunchSequence } from '@/shell/LaunchSequence';
import { FlagWatermark } from '@/emblems/Flag';
import { convexClient } from '@/data/convexClient';
import { handleError } from '@/data/errors';
import { keepToken, useToken } from '@/data/token';

export const Route = createFileRoute('/accueil')({ component: Home });

const WIDTH = 720;

function Home() {
  return convexClient ? <ConnectedHome /> : <OfflineHome />;
}

function OfflineHome() {
  const { turning } = usePageTurn();
  return (
    <HomeSheet turning={turning}>
      <NoBackend />
    </HomeSheet>
  );
}

function HomeSheet({ turning, children }: { turning: Turning; children: ReactNode }) {
  return (
    <Newspaper width={WIDTH} turning={turning}>
      <div className="paper-grain @container relative border border-[var(--ink)] text-[var(--ink)] shadow-[0_20px_46px_rgba(0,0,0,.6),0_2px_0_rgba(0,0,0,.5)]">
        <div className="flex items-baseline justify-between gap-5 px-[30px] pt-[13px] pb-[9px]">
          <span className="eyebrow">{fr.home.edition}</span>
          <span className="font-[var(--font-mono)] text-[10.5px] tracking-[.14em] text-[var(--ink-faint)]">
            {romanDate(new Date())}
          </span>
          <span className="eyebrow">{fr.home.audience}</span>
        </div>

        <ThickRule />

        <div className="px-[30px] pt-[24px] pb-[18px] text-center">
          <h1 className="font-[var(--font-display)] text-[clamp(34px,7.4cqi,56px)] leading-[.92] font-extrabold tracking-[-.005em]">
            {fr.home.masthead}
          </h1>
          <p className="mt-[13px] text-[11.5px] tracking-[.2em] text-[var(--ink-note)] uppercase">
            {fr.home.tagline}
          </p>
        </div>

        <ThickRuleInverse />

        {children}

        <div
          aria-hidden
          className="pointer-events-none absolute right-[26px] bottom-[46px] rotate-[-9deg] border-2 border-[rgba(157,70,56,.55)] px-3 pt-[6px] pb-[5px] text-center text-[rgba(157,70,56,.62)]"
        >
          <div className="text-[10px] tracking-[.26em] uppercase">{fr.home.stampTitle}</div>
          <div className="mt-px font-[var(--font-mono)] text-[9px] tracking-[.14em]">
            {fr.home.stampSub}
          </div>
        </div>
      </div>
    </Newspaper>
  );
}

function ConnectedHome() {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
  const create = useMutation(api.seasons.create);
  const join = useMutation(api.seasons.join);
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [duration, setDuration] = useState<48 | 168>(48);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const knownToken = useToken();
  const preview = useQuery(api.seasons.preview, knownToken ? { token: knownToken } : 'skip');

  const toLobby = () => turn(() => void navigate({ to: '/salon' }));
  const toBoard = useCallback(() => void navigate({ to: '/plateau' }), [navigate]);

  /**
   * A launched season has no lobby left to show: resuming means walking back onto the
   * board. The sequence then serves as an airlock — it covers the map's loading.
   */
  const resume = () => {
    // A concluded season walks back onto the board like a running one: the wipe is manual, and
    // reading the game back is exactly what the season is kept for.
    if (preview?.status === 'launched' || preview?.status === 'concluded') setResuming(true);
    else toLobby();
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { token } = await create({ nickname, durationHours: duration, compensation: 0.5 });
      keepToken(token);
      toLobby();
    } catch (problem) {
      handleError(problem, setError);
    }
  };

  const submitJoin = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const { token } = await join({ code, nickname });
      keepToken(token);
      toLobby();
    } catch (problem) {
      handleError(problem, setError);
    }
  };

  const nicknameReady = nickname.trim().length > 1;

  return (
    <>
      <HomeSheet turning={turning}>
        {preview && (
          <div className="mx-[30px] mt-[20px]">
            <button
              type="button"
              onClick={resume}
              className={`relative flex w-full cursor-pointer items-center gap-4 overflow-hidden bg-[var(--ink)] py-[13px] pr-5 text-left ${
                preview.nation ? 'pl-[106px]' : 'pl-5'
              }`}
            >
              <FlagWatermark nation={preview.nation} opacity={0.34} />
              <span
                className="relative flex-1"
                style={{ textShadow: '0 1px 3px rgba(23,18,8,.9)' }}
              >
                <span className="block text-[12px] tracking-[.22em] text-[var(--paper)] uppercase">
                  {fr.home.resume}
                </span>
                <span className="mt-1 flex flex-wrap gap-x-4 text-[11.5px] text-[var(--paper-dim-2)]">
                  <span>
                    {nationLabel(preview.nation)}
                    {preview.doctrine ? ` · ${fr.banner.doctrine(doctrineLabel(preview.doctrine) ?? '')}` : ''}
                  </span>
                  <span>
                    {preview.status === 'concluded' && preview.winnerNation
                      ? fr.victory.homeConcluded(nationLabel(preview.winnerNation))
                      : preview.status === 'lobby'
                        ? fr.home.resumeLobby(preview.code)
                        : fr.home.resumeSeason}{' '}
                    ·{' '}
                    {fr.playableRegions[preview.playableRegion as PlayableRegion] ?? preview.playableRegion}
                  </span>
                  <span className="text-[var(--notable)]">{fr.common.players(preview.players)}</span>
                </span>
              </span>
              <span className="relative text-right">
                <span className="eyebrow-dark block">
                  {preview.status === 'lobby' ? fr.home.statusLabel : fr.home.endsIn}
                </span>
                <span className="block font-[var(--font-mono)] text-[16px] text-[var(--paper)]">
                  {preview.status === 'lobby'
                    ? fr.home.open
                    : preview.status === 'concluded'
                      ? fr.home.finished
                      : remaining(preview.launchedAt, preview.durationHours)}
                </span>
              </span>
            </button>
          </div>
        )}

        <div className="mx-[30px] mt-5">
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">{fr.home.nicknameLabel}</span>
            <span className="text-[10.5px] text-[var(--ink-faint)]">{fr.home.nicknameNote}</span>
          </div>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            className="mt-[6px] w-full border border-[var(--ink)] bg-transparent px-[14px] py-3 text-[17px] text-[var(--ink)] outline-none"
            placeholder={fr.home.nicknamePlaceholder}
          />
        </div>

        <div className="mx-[30px] mt-6 flex items-stretch border-t border-[var(--ink)]">
          <form onSubmit={submitCreate} className="flex-1 pt-4 pr-[26px] pb-1">
            <Title numeral="I" title={fr.home.foundTitle} />
            <p className="mt-[5px] text-[11.5px] text-[var(--ink-note)]">{fr.home.foundNote}</p>

            <div className="eyebrow mt-[14px]">{fr.home.paceLabel}</div>
            <div className="mt-[6px] flex gap-2">
              {PACES.map((pace) => (
                <button
                  key={pace.hours}
                  type="button"
                  onClick={() => setDuration(pace.hours)}
                  className={`flex-1 cursor-pointer border border-[var(--ink)] px-2 py-[9px] text-center ${
                    duration === pace.hours
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-[var(--ink)] hover:bg-[rgba(42,33,24,.08)]'
                  }`}
                >
                  <span className="block text-[12px] tracking-[.16em] uppercase">
                    {pace.name}
                  </span>
                  <span className="mt-[3px] block text-[10.5px] opacity-70">{pace.note}</span>
                </button>
              ))}
            </div>

            <div className="eyebrow mt-[14px]">{fr.home.regionLabel}</div>
            <div className="mt-[6px] flex gap-2">
              {REGIONS.map((region) => (
                <span
                  key={region}
                  className="flex-1 border border-dashed border-[rgba(42,33,24,.4)] px-2 py-[7px] text-center text-[var(--ink-faint)]"
                >
                  <span className="block text-[10.5px] tracking-[.12em] uppercase">
                    {fr.home.regionShort[region]}
                  </span>
                  <span className="mt-[2px] block font-[var(--font-mono)] text-[10px]">
                    {fr.home.regionSlots[region]}
                  </span>
                </span>
              ))}
            </div>

            <Commit active={nicknameReady} type="submit">
              {fr.home.foundSubmit}
            </Commit>
          </form>

          <div
            aria-hidden
            className="w-px"
            style={{
              background:
                'repeating-linear-gradient(180deg, var(--ink) 0 4px, transparent 4px 9px)',
            }}
          />

          <form onSubmit={submitJoin} className="flex-1 pt-4 pb-1 pl-[26px]">
            <Title numeral="II" title={fr.home.joinTitle} />
            <p className="mt-[5px] text-[11.5px] text-[var(--ink-note)]">{fr.home.joinNote}</p>

            <div className="eyebrow mt-[14px]">{fr.home.codeLabel}</div>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={6}
              className="mt-[6px] w-full border border-[var(--ink)] bg-transparent p-[14px] text-center font-[var(--font-mono)] text-[22px] tracking-[.42em] text-[var(--ink)] uppercase outline-none"
              placeholder={fr.home.codePlaceholder}
            />
            <p className="mt-2 text-[10.5px] text-[var(--ink-faint)]">{fr.home.joinHint}</p>
            <Commit active={nicknameReady && code.length === 6} type="submit">
              {fr.home.joinSubmit}
            </Commit>
          </form>
        </div>

        {error && (
          <p className="mx-[30px] mt-4 border border-[var(--critical)] px-3 py-2 text-[12.5px]">
            {error}
          </p>
        )}

        <div className="mx-[30px] mt-[26px] flex items-center justify-between border-t border-[rgba(42,33,24,.35)] pt-[9px] pb-[14px] text-[10px] tracking-[.16em] text-[var(--ink-faint)] uppercase">
          <span>{fr.home.footerLeft}</span>
          <span className="font-[var(--font-mono)] tracking-[.12em]">{fr.home.footerRight}</span>
        </div>
      </HomeSheet>

      {resuming && preview && (
        <LaunchSequence
          region={fr.playableRegions[preview.playableRegion as PlayableRegion] ?? preview.playableRegion}
          pace={preview.durationHours === 48 ? fr.lobby.pace48 : fr.lobby.pace168}
          players={preview.players}
          onEnd={toBoard}
        />
      )}
    </>
  );
}

function Title({ numeral, title }: { numeral: string; title: string }) {
  return (
    <div className="flex items-baseline gap-[10px]">
      <span className="font-[var(--font-mono)] text-[11px] text-[var(--notable)]">{numeral}</span>
      <h2 className="font-[var(--font-display)] text-[21px] font-bold">{title}</h2>
    </div>
  );
}

function Commit({
  active,
  type,
  children,
}: {
  active: boolean;
  type: 'submit' | 'button';
  children: string;
}) {
  return (
    <button
      type={type}
      disabled={!active}
      className={`mt-[14px] w-full border p-[13px] text-[11px] tracking-[.22em] uppercase ${
        active
          ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
          : 'cursor-not-allowed border-[rgba(42,33,24,.3)] bg-[rgba(42,33,24,.12)] text-[var(--ink-faint)]'
      }`}
    >
      {children}
    </button>
  );
}

function NoBackend() {
  return (
    <p className="px-[30px] pt-6 pb-4 text-[13.5px] leading-[1.55]">
      {fr.home.noBackend.before}
      <span className="font-[var(--font-mono)]">{fr.home.noBackend.env}</span>
      {fr.home.noBackend.middle}
      <span className="font-[var(--font-mono)]">{fr.home.noBackend.command}</span>
      {fr.home.noBackend.after}
      <span className="font-[var(--font-mono)]">{fr.home.noBackend.readme}</span>
      {fr.home.noBackend.end}
    </p>
  );
}

const PACES = [
  { hours: 48, name: fr.home.paces.fast.name, note: fr.home.paces.fast.note },
  { hours: 168, name: fr.home.paces.long.name, note: fr.home.paces.long.note },
] as const satisfies ReadonlyArray<{ hours: 48 | 168; name: string; note: string }>;

const REGIONS: ReadonlyArray<PlayableRegion> = ['europe', 'europe-med', 'world'];

const ROMAN_NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

function roman(value: number): string {
  return ROMAN_NUMERALS.reduce((accumulated, [amount, sign]) => {
    while (value >= amount) {
      accumulated += sign;
      value -= amount;
    }
    return accumulated;
  }, '');
}

function romanDate(date: Date): string {
  return [date.getDate(), date.getMonth() + 1, date.getFullYear()].map(roman).join(' · ');
}

function remaining(launchedAt: number | null, durationHours: number): string {
  if (launchedAt === null) return '—';
  const milliseconds = launchedAt + durationHours * 3_600_000 - Date.now();
  if (milliseconds <= 0) return fr.home.finished;
  const minutes = Math.floor(milliseconds / 60_000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
