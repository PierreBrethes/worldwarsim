import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../convex/_generated/api';
import { DOCTRINES, NATIONS, POUVOIR_PAR_NATION } from '@/domaine/nations';
import { BanniereDrapeau, Drapeau } from '@/emblemes/Drapeau';
import { clientConvex } from '@/donnees/clientConvex';
import { lireJeton, oublierJeton } from '@/donnees/jeton';

export const Route = createFileRoute('/salon')({ component: Salon });

function Salon() {
  const jeton = lireJeton();
  if (!clientConvex || !jeton) return <Navigate to="/accueil" />;
  return <SalonConnecte jeton={jeton} />;
}

function SalonConnecte({ jeton }: { jeton: string }) {
  const naviguer = useNavigate();
  const salon = useQuery(api.saisons.salon, { jeton });
  const reserver = useMutation(api.joueurs.reserverNation);
  const choisirDoctrine = useMutation(api.joueurs.choisirDoctrine);
  const declarerPret = useMutation(api.joueurs.declarerPret);
  const lancer = useMutation(api.saisons.lancer);
  const [erreur, setErreur] = useState<string | null>(null);

  if (salon === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--desk)]">
        <span className="eyebrow-sombre">Ouverture du salon…</span>
      </div>
    );
  }
  if (salon.statut === 'lancee') return <Navigate to="/plateau" />;

  const agir = (action: () => Promise<unknown>) => {
    setErreur(null);
    action().catch((probleme: unknown) =>
      setErreur(probleme instanceof Error ? probleme.message : String(probleme)),
    );
  };
  const nationDe = (nation: string) => salon.joueurs.find((joueur) => joueur.nation === nation);
  const tousPrets = salon.joueurs.length >= 2 && salon.joueurs.every((joueur) => joueur.pret);

  return (
    <div className="flex h-full items-start justify-center overflow-auto bg-[var(--desk)] px-6 py-[34px]">
      <div className="hud trame-papier w-[960px] max-w-full border border-[var(--ink)] px-[30px] pt-[22px] pb-6">
        <div className="flex items-center justify-between text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>salon de saison — {salon.dureeHeures === 48 ? '48 heures' : '7 jours'}</span>
          <span>région : {salon.regionJouable}</span>
          <button
            type="button"
            onClick={() => {
              oublierJeton();
              void naviguer({ to: '/accueil' });
            }}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            quitter
          </button>
        </div>

        <div className="mt-3 border-t-2 border-b border-[var(--ink)] py-4 text-center">
          <div className="eyebrow">code de partie — à partager</div>
          <div className="mt-1 font-[var(--font-mono)] text-[44px] font-medium tracking-[.3em] text-[var(--ink)]">
            {salon.code}
          </div>
        </div>

        <div className="mt-4 flex items-start gap-[26px]">
          <section className="min-w-0 flex-1">
            <h2 className="eyebrow border-b border-[var(--ink)] pb-[6px]">nations — premier arrivé, premier servi</h2>
            <div className="mt-2 grid grid-cols-4 gap-[6px]">
              {NATIONS.map((nation) => {
                const preneur = nationDe(nation);
                const aMoi = salon.moi.nation === nation;
                return (
                  <button
                    key={nation}
                    type="button"
                    onClick={() => agir(() => reserver({ jeton, nation: aMoi ? null : nation }))}
                    disabled={Boolean(preneur) && !aMoi}
                    title={POUVOIR_PAR_NATION[nation]}
                    className={`flex flex-col overflow-hidden border-2 bg-[var(--desk)] text-left ${
                      aMoi
                        ? 'cursor-pointer border-[var(--notable)]'
                        : preneur
                          ? 'cursor-not-allowed border-[var(--ink-quiet)] opacity-40'
                          : 'cursor-pointer border-[var(--ink-quiet)] hover:border-[var(--paper-dim)]'
                    }`}
                  >
                    <BanniereDrapeau nation={nation} />
                    <span className="flex w-full flex-col gap-[1px] px-2 py-[6px]">
                      <span className="truncate font-[var(--font-display)] text-[12px] font-extrabold tracking-[.02em] text-[var(--paper)] uppercase">
                        {nation}
                      </span>
                      <span className="truncate text-[9px] tracking-[.14em] text-[var(--paper-dim)] uppercase">
                        {preneur ? preneur.pseudo : nation === 'États-Unis' ? 'à équilibrer' : 'libre'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
              La réservation se relâche d’un clic tant que la saison n’est pas lancée. La richesse des
              pays neutres (graine) ne sera révélée qu’au lancement.
            </p>
          </section>

          <aside className="w-[300px] shrink-0">
            <h2 className="eyebrow border-b border-[var(--ink)] pb-[6px]">
              joueurs — {salon.joueurs.length} / 8
            </h2>
            <ul className="mt-2 flex flex-col gap-[5px]">
              {salon.joueurs.map((joueur) => (
                <li key={joueur.pseudo} className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
                  <Drapeau nation={joueur.nation} largeur={21} surPapier />
                  <span className="min-w-0 flex-1 truncate">
                    {joueur.pseudo}
                    {joueur.createur && <span className="ml-1 text-[10px] text-[var(--ink-soft)] uppercase">fondateur</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--ink-soft)]">
                    {joueur.nation ?? 'sans nation'} · {joueur.pret ? 'prêt' : '…'}
                  </span>
                </li>
              ))}
            </ul>

            <h2 className="eyebrow mt-4 border-b border-[var(--ink)] pb-[6px]">ma doctrine — secrète</h2>
            <div className="mt-2 flex gap-[5px]">
              {DOCTRINES.map((doctrine) => (
                <button
                  key={doctrine}
                  type="button"
                  onClick={() => agir(() => choisirDoctrine({ jeton, doctrine }))}
                  className={`flex-1 cursor-pointer border border-[var(--ink)] py-2 text-[10px] tracking-[.08em] uppercase ${
                    salon.moi.doctrine === doctrine
                      ? 'bg-[var(--interaction)] text-[var(--paper)]'
                      : 'text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
                  }`}
                >
                  {doctrine}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[var(--ink-soft)]">
              Personne d’autre ne voit ce choix, seulement « prêt / pas prêt ».
            </p>

            <button
              type="button"
              onClick={() => agir(() => declarerPret({ jeton, pret: !salon.moi.pret }))}
              className={`mt-4 w-full cursor-pointer border py-[10px] text-[10px] tracking-[.2em] uppercase ${
                salon.moi.pret
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'
              }`}
            >
              {salon.moi.pret ? 'prêt — annuler' : 'me déclarer prêt'}
            </button>

            {salon.moi.createur && (
              <button
                type="button"
                disabled={!tousPrets}
                onClick={() => agir(() => lancer({ jeton }))}
                className="mt-2 w-full cursor-pointer bg-[var(--ink)] py-3 text-[11px] tracking-[.22em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                lancer la saison — irréversible
              </button>
            )}
          </aside>
        </div>

        {erreur && (
          <p className="mt-4 border border-[var(--critique)] px-3 py-2 text-[12.5px] text-[var(--ink)]">{erreur}</p>
        )}
      </div>
    </div>
  );
}
