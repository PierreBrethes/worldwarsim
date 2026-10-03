import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import { fr, clockLabel } from '@/i18n/fr';
import { AccountForm } from '@/shell/AccountForm';
import { EntrySheet, TOUCH_TARGET } from '@/shell/EntrySheet';
import { FilmTrailer } from '@/shell/FilmTrailer';
import { Wordmark } from '@/shell/Masthead';
import { ThickRule, ThickRuleInverse, usePageTurn, type Turning } from '@/shell/Newspaper';
import { convexClient } from '@/data/convexClient';
import { errorMessage } from '@/data/errors';
import { resumeSeat } from '@/data/resumeSeat';
import { keepSeat, useSession } from '@/data/session';
import { useSingleFlight } from '@/data/useSingleFlight';
import { asDayAndTime } from '@/domain/duration';
import { normalizeGameCode } from '@/domain/off-season';

export const Route = createFileRoute('/rejoindre/$code')({ component: Invitation });

const WIDTH = 520;

function Invitation() {
  const { code } = Route.useParams();
  return convexClient ? <InvitationPage code={code} /> : <NoBackend />;
}

function NoBackend() {
  const { turning } = usePageTurn();
  return (
    <Sheet turning={turning}>
      <p className="mx-(--sheet-pad) py-6 text-[13.5px] leading-[1.55]">{fr.auth.noBackend}</p>
    </Sheet>
  );
}

/** Une feuille réduite, comme le salon : la manchette en une ligne, puis ce que la page a à dire. */
function Sheet({ turning, children }: { turning: Turning; children: ReactNode }) {
  return (
    <EntrySheet width={WIDTH} turning={turning}>
      <div className="flex flex-wrap items-center gap-x-[14px] gap-y-1 px-(--sheet-pad) pt-3 pb-[10px]">
        <Wordmark size={17} />
        <span className="flex-1" />
        <span className="eyebrow">{fr.invitation.tagline}</span>
      </div>
      <ThickRule margin="var(--sheet-pad)" />
      {children}
    </EntrySheet>
  );
}

/**
 * **Un lien, un compte, le salon.** La page lit l'invitation avant tout (`seasons.invitation`,
 * sans session obligatoire) et ne demande rien d'autre que ce qu'il faut pour entrer : le
 * formulaire de compte si personne n'est connecté, un bouton sinon — et si la place existe déjà,
 * elle se reprend comme à l'accueil.
 *
 * Un refus est une phrase et une sortie (ADR 0015). **Le compte peut naître sans place** : si
 * `join` refuse après l'inscription — le salon s'est rempli entre-temps —, la session reste, la
 * page le dit et mène à l'accueil.
 */
export function InvitationPage({ code: raw }: { code: string }) {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
  const token = useSession();
  const code = normalizeGameCode(raw);
  const me = useQuery(api.accounts.me, token === null ? 'skip' : { token });
  const invitation = useQuery(
    api.seasons.invitation,
    code === null ? 'skip' : token === null ? { code } : { code, token },
  );
  const join = useMutation(api.seasons.join);
  const { run, pending } = useSingleFlight();
  const [late, setLate] = useState<{ message: string; accountCreated: boolean } | null>(null);

  const toSalon = () => turn(() => void navigate({ to: '/salon' }));

  /** Entrer avec une session donnée. Un refus du serveur n'est pas une erreur de formulaire :
   *  il se dit sur la page, le compte — s'il vient de naître — est gardé. */
  const enter = async (session: string, accountCreated: boolean) => {
    if (code === null) return;
    try {
      const { seasonId } = await join({ token: session, code });
      keepSeat(seasonId);
      toSalon();
    } catch (problem) {
      if (errorMessage(problem) === null) console.error(problem);
      setLate({ message: errorMessage(problem) ?? fr.unexpectedError, accountCreated });
    }
  };

  const home = (
    <Link
      to="/accueil"
      className={`mt-4 text-[11.5px] text-[var(--ink-note)] underline underline-offset-4 hover:text-[var(--ink)] ${TOUCH_TARGET}`}
    >
      {fr.invitation.toHome}
    </Link>
  );

  const sentence = (message: string, extra?: string) => (
    <div className="mx-(--sheet-pad) py-6">
      <p role="alert" className="border border-[var(--critical)] px-3 py-2 text-[13px]">
        {message}
      </p>
      {extra !== undefined && <p className="mt-3 text-[12px] text-[var(--ink-note)]">{extra}</p>}
      {home}
    </div>
  );

  /** Dit avant d'attendre quoi que ce soit : la session vient de naître, la relire (`me`) prend un
   *  aller-retour, et pendant ce temps le refus ne doit pas disparaître sous « ouverture ». */
  if (late !== null) {
    return (
      <Sheet turning={turning}>
        {sentence(late.message, late.accountCreated ? fr.invitation.accountKept : undefined)}
      </Sheet>
    );
  }
  const loading =
    code !== null && (invitation === undefined || (token !== null && me === undefined));
  if (loading) {
    return (
      <Sheet turning={turning}>
        <p className="mx-(--sheet-pad) py-6 text-[13.5px]">{fr.invitation.opening}</p>
      </Sheet>
    );
  }

  if (invitation === undefined || invitation === null) {
    return <Sheet turning={turning}>{sentence(fr.errors.UNKNOWN_GAME_CODE())}</Sheet>;
  }

  const facts = (
    <div className="mx-(--sheet-pad) pt-[18px]">
      <h1 className="font-(family-name:--font-display) text-[26px] leading-none font-extrabold tracking-[.02em] break-words uppercase max-md:text-[22px]">
        {fr.invitation.invitedBy(invitation.founder)}
      </h1>
      <p className="mt-3 text-[12px] text-[var(--ink-note)]">
        {fr.invitation.duration(clockLabel(invitation.durationHours))}
        {' — '}
        {fr.invitation.placesLeft(Math.max(0, invitation.maximum - invitation.players))}
      </p>
      <FilmTrailer className="mt-2 mb-[14px]" />
    </div>
  );

  if (invitation.seated !== null) {
    const seat = invitation.seated;
    return (
      <Sheet turning={turning}>
        {facts}
        <ThickRuleInverse margin="var(--sheet-pad)" />
        <div className="mx-(--sheet-pad) py-5">
          <Primary
            onClick={() =>
              resumeSeat(seat, {
                salon: toSalon,
                plateau: () => turn(() => void navigate({ to: '/plateau' })),
              })
            }
          >
            {fr.invitation.resume}
          </Primary>
        </div>
      </Sheet>
    );
  }

  if (invitation.refusal !== null) {
    const closedAt = invitation.registrationClosesAt;
    const message =
      invitation.refusal === 'REGISTRATION_CLOSED' && closedAt !== null
        ? fr.invitation.closedSince(asDayAndTime(closedAt))
        : fr.errors[invitation.refusal]({ maximum: invitation.maximum });
    return (
      <Sheet turning={turning}>
        {facts}
        {sentence(message)}
      </Sheet>
    );
  }

  return (
    <Sheet turning={turning}>
      {facts}
      <ThickRuleInverse margin="var(--sheet-pad)" />
      {me !== undefined && me !== null && token !== null ? (
        <div className="mx-(--sheet-pad) py-5">
          <p className="mb-3 text-[12px] text-[var(--ink-note)]">
            {fr.invitation.signedIn(me.nickname)}
          </p>
          <Primary disabled={pending} onClick={() => void run(() => enter(token, false))}>
            {fr.invitation.join}
          </Primary>
        </div>
      ) : (
        <AccountForm onSignedIn={(session) => enter(session, true)} />
      )}
    </Sheet>
  );
}

function Primary({
  children,
  onClick,
  disabled = false,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="min-h-11 w-full cursor-pointer border border-[var(--ink)] bg-[var(--ink)] p-[13px] text-[11px] tracking-[.22em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
