import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useCallback, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../convex/_generated/api';
import { fr, clockLabel, nationLabel } from '@/i18n/fr';
import type { PlayableRegion } from '@/domain/ids';
import { REGISTRATION_WINDOW_HOURS } from '@/domain/off-season';
import { ThickRuleInverse, Newspaper, usePageTurn, type Turning } from '@/shell/Newspaper';
import { Masthead } from '@/shell/Masthead';
import { DestroyButton } from '@/shell/DestroyButton';
import { LaunchSequence } from '@/shell/LaunchSequence';
import { FlagWatermark } from '@/emblems/Flag';
import { convexClient } from '@/data/convexClient';
import { handleError } from '@/data/errors';
import { resumeSeat } from '@/data/resumeSeat';
import { useSingleFlight } from '@/data/useSingleFlight';
import { forgetSession, keepSeat, useSession } from '@/data/session';

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
          <span className="eyebrow">{fr.home.audience}</span>
        </div>

        {/* La date a quitté l'oreille pour la ligne de date de la manchette, qui est sa place
            dans un quotidien — et il n'y en a qu'une sur la page. */}
        <div className="px-[30px] pt-[6px] pb-[18px] text-center">
          <Masthead date={romanDate(new Date())} />
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
          <div className="mt-px font-(family-name:--font-mono) text-[9px] tracking-[.14em]">
            {fr.home.stampSub}
          </div>
        </div>
      </div>
    </Newspaper>
  );
}

/** `null` = sans horloge (révision du 27/08 de l'ADR 0017). Le serveur accepte toujours les
 *  trois valeurs : c'est l'écran qui a cessé d'en proposer une. */
type Clock = 48 | 168 | null;

/**
 * **Ce que fonder décide à la place du joueur** (décision du 31/08). L'écran ne pose plus la
 * question ; l'horloge optionnelle et les théâtres restent entiers côté serveur — `seasons.create`
 * garde ses arguments et une saison à 48 h reste fondable par l'API. Rouvrir le choix, c'est
 * relire ces deux lignes, pas fouiller.
 */
const FOUNDED_CLOCK: Clock = null;

/** **`seasons.create` n'en prend pas** : le théâtre tombe de `playableRegion(présents)` au
 *  lancement, et 2–3 joueurs donnent l'Europe. La constante est là pour que la phrase de la
 *  carte et ce qu'on obtient se lisent au même endroit. */
const FOUNDED_REGION: PlayableRegion = 'europe';

function ConnectedHome() {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
  const create = useMutation(api.seasons.create);
  const join = useMutation(api.seasons.join);
  const destroy = useMutation(api.seasons.destroy);
  const logout = useMutation(api.accounts.logout);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState<Seat | null>(null);
  /** Le compte est déjà garanti par la racine (`__root.tsx`) : sans session valide, cette
   *  feuille n'est pas montée. La chaîne vide n'arme donc rien, elle satisfait le type. */
  const token = useSession() ?? '';
  const me = useQuery(api.accounts.me, { token });
  /** **La liste des parties est à part de la porte** (révision du 12/09 de l'ADR 0022) : c'est
   *  le seul écran qui la demande, et elle lit une table de jeu que le gardien racine n'a plus
   *  à garder en vue. */
  const seats = useQuery(api.accounts.seats, { token });

  // Newest first: the game one just founded is the one one comes back for.
  const mine = useMemo(
    () => [...(seats ?? [])].sort((left, right) => right.createdAt - left.createdAt),
    [seats],
  );

  const toLobby = () => turn(() => void navigate({ to: '/salon' }));
  const toBoard = useCallback(() => void navigate({ to: '/plateau' }), [navigate]);

  /**
   * A launched season has no lobby left to show **to a belligerent**: resuming means walking
   * back onto the board. The sequence then serves as an airlock — it covers the map's loading.
   *
   * A concluded season walks back onto the board like a running one: the wipe is manual, and
   * reading the game back is exactly what the season is kept for.
   */
  /** A seat on a running season whose owner has not entered the war goes back to the lobby
   *  too: he holds no nation yet, and it is there that he enters (`seasons.enterWar`). */
  const resume = (seat: Seat) =>
    resumeSeat(seat, { salon: toLobby, plateau: () => setResuming(seat) });

  /** One answer awaited at a time: `seasons.create` refuses nothing, so a double press on
   *  "fonder" would found two seasons. */
  const { run: runOnce, pending } = useSingleFlight();

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    await runOnce(async () => {
      try {
        const { seasonId } = await create({
          token,
          durationHours: FOUNDED_CLOCK,
          compensation: 0.5,
        });
        keepSeat(seasonId);
        toLobby();
      } catch (problem) {
        handleError(problem, setError);
      }
    });
  };

  const submitJoin = async (event: FormEvent) => {
    event.preventDefault();
    await runOnce(async () => {
      try {
        const { seasonId } = await join({ token, code });
        keepSeat(seasonId);
        toLobby();
      } catch (problem) {
        handleError(problem, setError);
      }
    });
  };

  return (
    <>
      <HomeSheet turning={turning}>
        {mine.length > 0 && (
          <div className="mx-[30px] mt-[20px]">
            <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[7px]">
              <span className="eyebrow">{fr.home.gamesHeader}</span>
              <span className="text-[10.5px] text-[var(--ink-note)]">{fr.home.gamesNote}</span>
            </div>
            <ul className="mt-3 flex flex-col gap-3">
              {mine.map((seat) => (
                <GameRow
                  key={seat.seasonId}
                  seat={seat}
                  onResume={() => resume(seat)}
                  onDestroy={() =>
                    void destroy({ token, seasonId: seat.seasonId }).catch((problem: unknown) =>
                      handleError(problem, setError),
                    )
                  }
                />
              ))}
            </ul>
          </div>
        )}

        {/* Les deux bureaux côte à côte tant que la page en a la largeur ; l'un sous l'autre
            sous une feuille étroite, où chacun n'avait plus que cent trente pixels et débordait
            de la page. */}
        <div className="mx-[30px] mt-6 flex flex-col items-stretch border-t border-[var(--ink)] @md:flex-row">
          <form onSubmit={submitCreate} className="flex-1 pt-4 pb-1 @md:pr-[26px]">
            <Title numeral="I" title={fr.home.foundTitle} />
            <p className="mt-[5px] text-[11.5px] text-[var(--ink-note)]">
              {fr.home.foundNote(regionNameOf(FOUNDED_REGION))}
            </p>

            <Commit active={!pending} type="submit">
              {fr.home.foundSubmit}
            </Commit>
          </form>

          <div
            aria-hidden
            className="hidden w-px @md:block"
            style={{
              background:
                'repeating-linear-gradient(180deg, var(--ink) 0 4px, transparent 4px 9px)',
            }}
          />

          <form
            onSubmit={submitJoin}
            className="flex-1 border-t border-dashed border-[var(--ink)] pt-4 pb-1 @md:border-t-0 @md:pl-[26px]"
          >
            <Title numeral="II" title={fr.home.joinTitle} />
            <p className="mt-[5px] text-[11.5px] text-[var(--ink-note)]">{fr.home.joinNote}</p>

            <div className="eyebrow mt-[14px]">{fr.home.codeLabel}</div>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              maxLength={6}
              className="mt-[6px] w-full border border-[var(--ink)] bg-transparent p-[14px] text-center font-(family-name:--font-mono) text-[22px] tracking-[.42em] text-[var(--ink)] uppercase outline-none"
              placeholder={fr.home.codePlaceholder}
            />
            <p className="mt-2 text-[10.5px] text-[var(--ink-note)]">
              {fr.home.joinHint(REGISTRATION_WINDOW_HOURS)}
            </p>
            <Commit active={code.length === 6 && !pending} type="submit">
              {fr.home.joinSubmit}
            </Commit>
          </form>
        </div>

        {error && (
          <p className="mx-[30px] mt-4 border border-[var(--critical)] px-3 py-2 text-[12.5px]">
            {error}
          </p>
        )}

        {/** **La déconnexion vit aussi ici**, et pas seulement dans les Réglages du plateau :
         *   un compte sans partie n'a pas de plateau, et il serait enfermé sur cette feuille. */}
        <div className="mx-[30px] mt-[22px] flex items-baseline justify-between gap-4">
          <span className="eyebrow">{fr.auth.signedIn(me?.nickname ?? '')}</span>
          <button
            type="button"
            onClick={() =>
              void logout({ token }).finally(() => {
                forgetSession();
                void navigate({ to: '/connexion' });
              })
            }
            className="cursor-pointer text-[11px] text-[var(--ink-note)] underline underline-offset-4 hover:text-[var(--ink)]"
          >
            {fr.auth.logout}
          </button>
        </div>

        <div className="mx-[30px] mt-[16px] flex items-center justify-between border-t border-(color:--ink)/35 pt-[9px] pb-[14px] text-[10px] tracking-[.16em] text-[var(--ink-note)] uppercase">
          <span>{fr.home.footerLeft}</span>
          <span className="font-(family-name:--font-mono) tracking-[.12em]">
            {fr.home.footerRight}
          </span>
        </div>
      </HomeSheet>

      {resuming && (
        <LaunchSequence
          region={regionNameOf(resuming.playableRegion)}
          pace={clockLabel(resuming.durationHours)}
          players={resuming.players}
          onEnd={toBoard}
        />
      )}
    </>
  );
}

type Seat = FunctionReturnType<typeof api.accounts.seats>[number];

/** Une place, une ligne. Le fondateur seul y porte un geste : mettre la saison au rebut, pour
 *  tout le monde. */
function GameRow({
  seat,
  onResume,
  onDestroy,
}: {
  seat: Seat;
  onResume: () => void;
  onDestroy: () => void;
}) {
  return (
    /* La ligne se casse en deux sous une feuille étroite : à 164 px, le bouton du fondateur ne
       laissait que soixante pixels au pays et sortait de la page. */
    <li className="flex flex-col items-stretch gap-3 @md:flex-row @md:items-start">
      <button
        type="button"
        onClick={onResume}
        title={fr.home.resume}
        className={`relative flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-2 overflow-hidden bg-[var(--ink)] py-[13px] pr-5 text-left @md:flex-row @md:items-center @md:gap-4 ${
          seat.nation ? 'pl-[76px] @md:pl-[106px]' : 'pl-5'
        }`}
      >
        <FlagWatermark nation={seat.nation} opacity={0.34} />
        <span
          className="relative min-w-0 flex-1"
          style={{ textShadow: '0 1px 3px color-mix(in srgb, var(--map-desk) 90%, transparent)' }}
        >
          <span className="block text-[12px] tracking-[.22em] text-[var(--paper)] uppercase">
            {nationLabel(seat.nation)}
          </span>
          <span className="mt-1 flex flex-wrap gap-x-4 text-[11.5px] text-[var(--paper-dim-2)]">
            <span>
              {standingOf(seat)} · {regionNameOf(seat.playableRegion)}
            </span>
            <span className="text-[var(--notable)]">{fr.common.players(seat.players)}</span>
            {seat.creator && (
              <span className="text-[10px] tracking-[.14em] text-[var(--paper-dim)] uppercase">
                {fr.lobby.founder}
              </span>
            )}
          </span>
        </span>
        <span className="relative shrink-0 @md:text-right">
          <span className="eyebrow-dark block">
            {seat.status === 'launched' && seat.durationHours !== null
              ? fr.home.endsIn
              : fr.home.statusLabel}
          </span>
          <span className="block font-(family-name:--font-mono) text-[16px] text-[var(--paper)]">
            {seat.status === 'lobby'
              ? fr.home.open
              : seat.status === 'concluded'
                ? fr.home.finished
                : remaining(seat.launchedAt, seat.durationHours)}
          </span>
        </span>
      </button>

      {/** **Une place ne se range plus dans un coin** : elle appartient au compte, pas au
       *   navigateur, et un bouton « retirer de ma liste » aurait effacé une ligne que la
       *   prochaine lecture aurait ramenée. Seul le fondateur a encore un geste : mettre la
       *   saison au rebut, pour tout le monde. */}
      {seat.creator && (
        <div className="w-full shrink-0 @md:w-[164px]">
          <DestroyButton
            label={fr.lobby.destroy}
            confirm={fr.lobby.destroyConfirm}
            note={fr.lobby.destroyNote}
            onDestroy={onDestroy}
          />
        </div>
      )}
    </li>
  );
}

function standingOf(seat: Seat): string {
  if (seat.status === 'lobby') return fr.home.resumeLobby(seat.code);
  if (seat.status === 'concluded' && seat.winnerNation) {
    return fr.victory.homeConcluded(nationLabel(seat.winnerNation));
  }
  /** **La ligne dit la défaite avant le code**, et le bouton ouvre le même plateau : capituler
   *  ne fait pas quitter une saison, il fait changer de siège — de joueur à observateur. */
  if (seat.defeated) return `${fr.home.resumeDefeated} · ${seat.code}`;
  return `${fr.home.resumeSeason} · ${seat.code}`;
}

const regionNameOf = (region: string): string =>
  fr.playableRegions[region as PlayableRegion] ?? region;

function Title({ numeral, title }: { numeral: string; title: string }) {
  return (
    <div className="flex items-baseline gap-[10px]">
      <span className="font-(family-name:--font-mono) text-[11px] text-[var(--notable)]">
        {numeral}
      </span>
      <h2 className="font-(family-name:--font-display) text-[21px] font-bold">{title}</h2>
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
          : 'cursor-not-allowed border-(color:--ink)/30 bg-(--ink)/12 text-[var(--ink-note)]'
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
      <span className="font-(family-name:--font-mono)">{fr.home.noBackend.env}</span>
      {fr.home.noBackend.middle}
      <span className="font-(family-name:--font-mono)">{fr.home.noBackend.command}</span>
      {fr.home.noBackend.after}
      <span className="font-(family-name:--font-mono)">{fr.home.noBackend.readme}</span>
      {fr.home.noBackend.end}
    </p>
  );
}

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

/** **Aucun compte à rebours sans horloge** — ni « ∞ », ni « 0 h 00 » : la ligne dit ce que la
 *  saison est, pas un temps qu'elle n'a pas. */
function remaining(launchedAt: number | null, durationHours: number | null): string {
  if (durationHours === null) return fr.home.noClock;
  if (launchedAt === null) return '—';
  const milliseconds = launchedAt + durationHours * 3_600_000 - Date.now();
  if (milliseconds <= 0) return fr.home.finished;
  const minutes = Math.floor(milliseconds / 60_000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}
