import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr, nationLabel, rendezvousLabel } from '@/i18n/fr';
import { AccountForm } from '@/shell/AccountForm';
import { Wordmark } from '@/shell/Masthead';
import { FlagChip, OffSeasonPage } from '@/shell/OffSeason';
import { Telegram } from '@/shell/Telegram';
import { convexClient } from '@/data/convexClient';
import { errorCode, errorMessage } from '@/data/errors';
import { resumeSeat } from '@/data/resumeSeat';
import { downloadRendezvous } from '@/data/rendezvous';
import { forgetSession, keepSeat, useSession } from '@/data/session';
import { useSingleFlight } from '@/data/useSingleFlight';
import { assetOf } from '@/domain/nation-assets';
import { normalizeGameCode, type JoinRefusal } from '@/domain/off-season';
import { DEFAULT_HQ_CAPTURE_HOURS, THEATRE_DRAW, presenceOf } from '@/domain/operation-order';
import { MODE_RULES } from '@/domain/season-mode';

const route = getRouteApi('/rejoindre/$code');

export function Invitation() {
  const { code } = route.useParams();
  return convexClient ? (
    <InvitationPage code={code} />
  ) : (
    <OffSeasonPage>
      <p className="note" style={{ padding: 40, color: 'var(--paper)' }}>
        {fr.auth.noBackend}
      </p>
    </OffSeasonPage>
  );
}

type Answer = FunctionReturnType<typeof api.seasons.invitation>;
type Refusal = Exclude<JoinRefusal, 'SEAT_TAKEN'> | 'UNKNOWN_GAME_CODE';

const theatreName = (theatre: string | null): string | null =>
  theatre === null || theatre === THEATRE_DRAW
    ? null
    : ((fr.modes.theatres as Record<string, string>)[theatre] ?? null);

/**
 * **Le télégramme** (choix 17) : qui invite, quoi, quand, la table et l'ordre — puis la réponse,
 * un dossier de deux champs ou « répondre présent ». La page lit l'invitation avant tout
 * (`seasons.invitation`, sans session obligatoire) ; ses refus sont ceux de `join`, par la même
 * fonction (`joinRefusalOf`), et chacun a une issue utile (choix 19). **Le compte peut naître sans
 * place** : si `join` refuse après l'inscription, la session reste et la page le dit.
 */
export function InvitationPage({ code: raw }: { code: string }) {
  const navigate = useNavigate();
  const token = useSession();
  const code = normalizeGameCode(raw);
  const me = useQuery(api.accounts.me, token === null ? 'skip' : { token });
  const invitation = useQuery(
    api.seasons.invitation,
    code === null ? 'skip' : token === null ? { code } : { code, token },
  );
  const join = useMutation(api.seasons.join);
  const { run, pending } = useSingleFlight();
  const [late, setLate] = useState<{
    refusal: Refusal | null;
    message: string;
    accountCreated: boolean;
  } | null>(null);
  const toSalon = () => void navigate({ to: '/salon' });

  const enter = async (session: string, accountCreated: boolean) => {
    if (code === null) return;
    try {
      const { seasonId } = await join({ token: session, code });
      keepSeat(seasonId);
      toSalon();
    } catch (problem) {
      if (errorMessage(problem) === null) console.error(problem);
      const refusal = errorCode(problem);
      setLate({
        refusal: refusal !== null && refusal in fr.table.refusals ? (refusal as Refusal) : null,
        message: errorMessage(problem) ?? fr.unexpectedError,
        accountCreated,
      });
    }
  };

  if (late !== null) {
    return (
      <RefusalPage
        refusal={late.refusal ?? 'REGISTRATION_CLOSED'}
        invitation={invitation ?? null}
        message={late.refusal === null ? late.message : null}
        accountKept={late.accountCreated}
      />
    );
  }
  if (code !== null && (invitation === undefined || (token !== null && me === undefined))) {
    return (
      <OffSeasonPage>
        <p className="eyebrow dark" style={{ padding: 40 }}>
          {fr.invitation.opening}
        </p>
      </OffSeasonPage>
    );
  }
  if (invitation === undefined || invitation.refusal === 'UNKNOWN_GAME_CODE') {
    return (
      <RefusalPage
        refusal="UNKNOWN_GAME_CODE"
        invitation={null}
        message={null}
        accountKept={false}
      />
    );
  }
  if (
    invitation.seated === null &&
    invitation.refusal !== null &&
    invitation.refusal !== 'SEAT_TAKEN'
  ) {
    return (
      <RefusalPage
        refusal={invitation.refusal}
        invitation={invitation}
        message={null}
        accountKept={false}
      />
    );
  }

  const blitz = invitation.mode === 'blitz';
  const founder = invitation.founder ?? '';
  const taken = invitation.seats.length;
  const scheduledAt = invitation.orders?.scheduledAt ?? null;
  const durationHours = invitation.durationHours ?? MODE_RULES.mondiale.clockHours;
  const now = Date.now();
  const when = scheduledAt === null ? null : rendezvousLabel(scheduledAt, now);
  const lines = blitz
    ? fr.table.telegram.blitzLines({
        from: founder,
        theatre: theatreName(invitation.theatre),
        when,
        seats: { taken, cap: invitation.maximum },
      })
    : fr.table.telegram.mondialeLines({
        from: founder,
        capture: invitation.orders?.hqCaptureHours ?? DEFAULT_HQ_CAPTURE_HOURS,
        days: Math.round(durationHours / 24),
        seats: { taken, cap: invitation.maximum },
      });
  const others = Math.max(0, invitation.maximum - taken - 1);
  const seated = invitation.seated;

  return (
    <OffSeasonPage>
      <div className="invit-wrap">
        <div className="invit">
          <div className="masthin">
            <Wordmark size={26} />
            <span className="eyebrow">{fr.invitation.tagline}</span>
            <span style={{ flex: 1 }} />
            <Link className="link dark" to={token === null ? '/' : '/accueil'}>
              {token === null ? fr.front.back : fr.invitation.toHome}
            </Link>
          </div>
          <div className="g-tg">
            <Telegram
              lines={lines}
              code={code ?? ''}
              origin={fr.table.telegram.tableOf(founder)}
              filed={fr.table.telegram.filedAt(now)}
            />
          </div>
          <section className="sheet reply" aria-labelledby="t-reply">
            <div className="eyebrow">{fr.invitation.reply}</div>
            <h2 id="t-reply">{fr.invitation.takeSeat(founder)}</h2>
            <div className="atable" aria-label={fr.invitation.alreadySeated}>
              {invitation.seats.map((entry, rank) => {
                const presence = presenceOf(entry.seenAt, now);
                const asset = assetOf(entry.nation, invitation.mode);
                return (
                  <div className="r" key={`${entry.nickname}${rank}`}>
                    <FlagChip nation={entry.nation} width={33} />
                    <b>{entry.nickname}</b>
                    <span className="note">
                      {entry.nation === null ? fr.table.toChoose(blitz) : nationLabel(entry.nation)}
                      {blitz
                        ? presence.kind === 'unknown'
                          ? ''
                          : ` · ${presence.kind === 'present' ? fr.table.atTable : fr.table.away}`
                        : asset === null
                          ? ''
                          : ` · ${fr.nationAssets[asset].name}`}
                    </span>
                  </div>
                );
              })}
              {seated === null && (
                <div className="r free">
                  <i />
                  {fr.invitation.yourSeat(others)}
                </div>
              )}
            </div>
            {seated !== null ? (
              <button
                type="button"
                className="btn primary wide"
                onClick={() =>
                  resumeSeat(seated, {
                    salon: toSalon,
                    plateau: () => void navigate({ to: '/plateau' }),
                  })
                }
              >
                {fr.invitation.resume}
              </button>
            ) : me !== undefined && me !== null && token !== null ? (
              <>
                <p className="note" style={{ margin: 0 }}>
                  {fr.invitation.signedIn(me.nickname)}{' '}
                  <button type="button" className="link" onClick={forgetSession}>
                    {fr.invitation.notYou}
                  </button>
                </p>
                <button
                  type="button"
                  className="btn primary wide"
                  aria-busy={pending}
                  onClick={() => void run(() => enter(token, false))}
                >
                  {fr.invitation.join}
                </button>
              </>
            ) : (
              /** Un lien d'invitation ouvert sans session, c'est presque toujours un premier
               *  passage : la carte s'ouvre sur le dossier à ouvrir. */
              <AccountForm
                invited
                opening
                portrait={null}
                onSignedIn={(session) => enter(session, true)}
              />
            )}
            {blitz && scheduledAt !== null ? (
              <button
                type="button"
                className="link"
                onClick={() =>
                  downloadRendezvous({
                    at: scheduledAt,
                    title: fr.home.calendarTitle(theatreName(invitation.theatre) ?? fr.table.draw),
                    code: code ?? '',
                  })
                }
              >
                {fr.invitation.addRendezvous}
              </button>
            ) : null}
          </section>
          <details className="sheet orderslip">
            <summary>
              <span className="eyebrow">{fr.invitation.readOrder}</span>
              <span className="note">{fr.invitation.setBy(founder)}</span>
            </summary>
            <dl>
              {(blitz
                ? fr.invitation.blitzOrder(theatreName(invitation.theatre), when)
                : fr.invitation.mondialeOrder(
                    invitation.orders?.hqCaptureHours ?? DEFAULT_HQ_CAPTURE_HOURS,
                    durationHours,
                  )
              ).map(([term, value]) => (
                <Row key={term} term={term} value={value} />
              ))}
            </dl>
          </details>
        </div>
      </div>
    </OffSeasonPage>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </>
  );
}

/** **Le refus est un télégramme « regrettons »**, et une issue utile : fonder sa propre partie,
 *  avec les mêmes réglages, plutôt qu'un simple retour (choix 19). */
function RefusalPage({
  refusal,
  invitation,
  message,
  accountKept,
}: {
  refusal: Refusal;
  invitation: Answer | null;
  message: string | null;
  accountKept: boolean;
}) {
  /** Qui n'a pas de compte n'a pas de parties : sa sortie est la une, où le code se retape. */
  const signedIn = useSession() !== null;
  const told = fr.table.refusals[refusal]({
    founder: invitation?.founder ?? null,
    maximum: invitation?.maximum ?? 0,
    theatre: theatreName(invitation?.theatre ?? null),
  });
  const now = Date.now();
  const theatre = invitation?.theatre ?? undefined;
  return (
    <OffSeasonPage>
      <div className="invit-wrap refus">
        <div className="invit">
          <div className="masthin">
            <Wordmark size={26} />
            <span className="eyebrow">{fr.invitation.bureauAnswer}</span>
          </div>
          <div className="g-tg">
            <Telegram
              lines={told.lines}
              code="······"
              origin={fr.invitation.bureau}
              filed={fr.table.telegram.filedAt(now)}
              refusal
              stamp={
                <span
                  className="stamp"
                  style={{ right: 22, bottom: -14, background: 'rgba(233,220,185,.6)' }}
                  aria-hidden
                >
                  {told.title}
                </span>
              }
            />
          </div>
          <section className="sheet reply" aria-labelledby="t-refus">
            <div className="eyebrow">{fr.invitation.doorClosed}</div>
            <h2 id="t-refus" role="alert">
              {told.title}
            </h2>
            <p className="italic" style={{ margin: 0 }}>
              {message ?? told.paragraph}
            </p>
            {accountKept && (
              <p className="note" style={{ margin: 0 }}>
                {fr.invitation.accountKept}
              </p>
            )}
            {told.found !== null && (
              <Link
                className="btn primary wide"
                to="/fonder"
                search={{
                  mode: invitation?.mode ?? 'blitz',
                  ...(invitation?.mode === 'blitz' && theatre !== undefined ? { theatre } : {}),
                }}
              >
                {told.found}
              </Link>
            )}
            {refusal === 'UNKNOWN_GAME_CODE' && (
              <Link className="btn primary wide" to={signedIn ? '/accueil' : '/'}>
                {fr.invitation.retype}
              </Link>
            )}
            {signedIn ? (
              <Link className="btn wide" to="/accueil">
                {fr.invitation.myGames}
              </Link>
            ) : (
              refusal !== 'UNKNOWN_GAME_CODE' && (
                <Link className="btn wide" to="/">
                  {fr.front.back}
                </Link>
              )
            )}
          </section>
        </div>
      </div>
    </OffSeasonPage>
  );
}
