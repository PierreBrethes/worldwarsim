import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { FiletFort, FiletFortInverse, Journal, useTourDePage } from '@/coque/Journal';
import { DOCTRINES, LIBELLE_DOCTRINE, NATIONS, POUVOIR_PAR_NATION } from '@/domaine/nations';
import { BanniereDrapeau, Drapeau } from '@/emblemes/Drapeau';
import { clientConvex } from '@/donnees/clientConvex';
import { lireJeton, oublierJeton } from '@/donnees/jeton';
import { Lancement } from '@/coque/Lancement';

export const Route = createFileRoute('/salon')({ component: Salon });

const LARGEUR = 760;
const NUMEROS = ['I', 'II', 'III'] as const;

function Salon() {
  const jeton = lireJeton();
  if (!clientConvex || !jeton) return <Navigate to="/accueil" />;
  return <SalonConnecte jeton={jeton} />;
}

function SalonConnecte({ jeton }: { jeton: string }) {
  const naviguer = useNavigate();
  const { tournant, tourner } = useTourDePage();
  const salon = useQuery(api.saisons.salon, { jeton });
  const reserver = useMutation(api.joueurs.reserverNation);
  const choisirDoctrine = useMutation(api.joueurs.choisirDoctrine);
  const declarerPret = useMutation(api.joueurs.declarerPret);
  const lancer = useMutation(api.saisons.lancer);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const versPlateau = useCallback(() => void naviguer({ to: '/plateau' }), [naviguer]);

  if (salon === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--desk)]">
        <span className="eyebrow-sombre">Ouverture du salon…</span>
      </div>
    );
  }

  const agir = (action: () => Promise<unknown>) => {
    setErreur(null);
    action().catch((probleme: unknown) =>
      setErreur(probleme instanceof Error ? probleme.message : String(probleme)),
    );
  };
  const nationDe = (nation: string) => salon.joueurs.find((joueur) => joueur.nation === nation);
  const tousPrets = salon.joueurs.length >= 2 && salon.joueurs.every((joueur) => joueur.pret);
  const cadence = salon.dureeHeures === 48 ? '48 heures' : '7 jours';
  const enLancement = salon.statut === 'lancee';

  const controles = [
    { libelle: 'une nation réservée', fait: salon.moi.nation !== null },
    { libelle: 'une doctrine scellée', fait: salon.moi.doctrine !== null },
    { libelle: 'tous les joueurs déclarés prêts', fait: tousPrets },
  ];
  const manquants = controles.filter((controle) => !controle.fait).length;
  const placesLibres = Math.min(2, 8 - salon.joueurs.length);
  const nationsLibres = NATIONS.filter((nation) => nationDe(nation) === undefined).length;

  const copierCode = () => {
    void navigator.clipboard.writeText(salon.code).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 1600);
    });
  };

  return (
    <>
      <div className="h-full">
        <Journal largeur={LARGEUR} tournant={tournant}>
        <div className="trame-papier @container relative border border-[var(--ink)] text-[var(--ink)] shadow-[0_20px_46px_rgba(0,0,0,.6),0_2px_0_rgba(0,0,0,.5)]">
          <div className="flex flex-wrap items-center gap-x-[14px] gap-y-1 px-[30px] pt-3 pb-[10px]">
            <Drapeau nation={salon.moi.nation} largeur={33} surPapier />
            <span className="font-[var(--font-display)] text-[17px] font-extrabold tracking-[.02em] uppercase">
              {salon.moi.nation ?? 'sans nation'}
            </span>
            <span className="flex-1" />
            <span className="eyebrow">salon de saison — {cadence}</span>
            <span className="eyebrow">région : {salon.regionJouable}</span>
            <button
              type="button"
              onClick={() => {
                oublierJeton();
                tourner(() => void naviguer({ to: '/accueil' }));
              }}
              className="cursor-pointer border border-[rgba(42,33,24,.55)] px-[13px] py-[6px] text-[10px] tracking-[.2em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              quitter
            </button>
          </div>

          <FiletFort />

          <div className="flex flex-wrap items-center gap-[26px] px-[30px] pt-[18px] pb-4">
            <div className="min-w-0 flex-1">
              <div className="eyebrow">code de partie — à partager</div>
              <div className="font-[var(--font-display)] text-[clamp(34px,6.6cqi,68px)] leading-[1.04] font-extrabold tracking-[.22em]">
                {salon.code}
              </div>
              <div className="text-[11.5px] text-[var(--ink-note)]">
                Toute personne qui a ce code peut prendre une nation libre.
              </div>
            </div>
            <div className="flex w-[200px] shrink-0 flex-col gap-2">
              <button
                type="button"
                onClick={copierCode}
                className="cursor-pointer border border-[var(--ink)] p-[10px] text-[10px] tracking-[.2em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
              >
                {copie ? 'code copié' : 'copier le code'}
              </button>
              <div className="text-center font-[var(--font-mono)] text-[10px] tracking-[.1em] text-[var(--ink-faint)]">
                salon ouvert · {salon.joueurs.length} / 8
              </div>
            </div>
          </div>

          <FiletFortInverse />

          <div className="mx-[30px] flex flex-col @2xl:flex-row @2xl:items-stretch">
            <section className="min-w-0 flex-1 pt-4 pb-2 @2xl:pr-[26px]">
              <div className="flex items-baseline justify-between border-b border-[var(--ink)] pb-[7px]">
                <span className="eyebrow">nations — premier arrivé, premier servi</span>
                <span className="text-[10.5px] text-[var(--ink-faint)]">{nationsLibres} libres</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-[9px] @md:grid-cols-3 @2xl:grid-cols-4">
                {NATIONS.map((nation) => {
                  const preneur = nationDe(nation);
                  const aMoi = salon.moi.nation === nation;
                  const prise = preneur !== undefined && !aMoi;
                  return (
                    <button
                      key={nation}
                      type="button"
                      onClick={() => agir(() => reserver({ jeton, nation: aMoi ? null : nation }))}
                      disabled={prise}
                      title={POUVOIR_PAR_NATION[nation]}
                      className={`block border border-[var(--ink)] bg-[var(--paper)] text-left transition-transform duration-100 ${
                        aMoi
                          ? 'shadow-[0_6px_14px_rgba(0,0,0,.3)] outline-2 outline-offset-1 outline-[var(--notable)] -translate-y-[2px] cursor-pointer'
                          : prise
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer hover:-translate-y-[1px]'
                      }`}
                    >
                      <span className="relative block">
                        <BanniereDrapeau nation={nation} />
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
                          {nation}
                        </span>
                        <span
                          className="mt-[2px] block truncate text-[9px] tracking-[.14em] uppercase"
                          style={{ color: encreDeStatut(aMoi, preneur !== undefined, nation) }}
                        >
                          {aMoi
                            ? 'vous'
                            : preneur
                              ? `prise · ${preneur.pseudo}`
                              : nation === 'États-Unis'
                                ? 'à équilibrer'
                                : 'libre'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] leading-[1.55] text-[var(--ink-note)]">
                La réservation se relâche d’un clic tant que la saison n’est pas lancée. La richesse des
                pays neutres (graine) ne sera révélée qu’au lancement.
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
                <span className="eyebrow">joueurs</span>
                <span className="font-[var(--font-mono)] text-[11px] text-[var(--ink-faint)]">
                  {salon.joueurs.length} / 8
                </span>
              </div>
              <ul className="mt-2 flex flex-col">
                {salon.joueurs.map((joueur) => (
                  <li
                    key={joueur.pseudo}
                    className="flex items-center gap-[9px] border-b border-[rgba(42,33,24,.16)] px-[2px] py-[6px]"
                  >
                    <Drapeau nation={joueur.nation} largeur={18} surPapier />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                      {joueur.pseudo}
                      {joueur.createur && (
                        <span className="ml-[6px] text-[9px] tracking-[.14em] text-[var(--ink-faint)] uppercase">
                          fondateur
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--ink-note)]">
                      {joueur.nation ?? 'sans nation'}
                    </span>
                    <span
                      className="shrink-0 text-[9px] tracking-[.14em] uppercase"
                      style={{ color: joueur.pret ? 'var(--valide)' : 'var(--ink-faint)' }}
                    >
                      {joueur.pret ? 'prêt' : 'en attente'}
                    </span>
                  </li>
                ))}
                {Array.from({ length: placesLibres }, (_, rang) => (
                  <li
                    key={`libre-${rang}`}
                    className="flex items-center gap-[9px] border-b border-dashed border-[rgba(42,33,24,.28)] px-[2px] py-[6px] text-[var(--ink-faint)]"
                  >
                    <span aria-hidden className="h-[9px] w-[9px] border border-[rgba(42,33,24,.3)]" />
                    <span className="text-[11px] tracking-[.14em] uppercase">place libre</span>
                  </li>
                ))}
              </ul>

              <div className="eyebrow mt-4 border-b border-[var(--ink)] pb-[7px]">
                ma doctrine — secrète
              </div>
              <div className="mt-[10px] flex gap-[6px]">
                {DOCTRINES.map((doctrine, rang) => (
                  <button
                    key={doctrine}
                    type="button"
                    onClick={() => agir(() => choisirDoctrine({ jeton, doctrine }))}
                    className={`flex-1 cursor-pointer border border-[var(--ink)] px-2 py-[9px] text-center ${
                      salon.moi.doctrine === doctrine
                        ? 'bg-[var(--ink)] text-[var(--paper)]'
                        : 'hover:bg-[rgba(42,33,24,.08)]'
                    }`}
                  >
                    <span className="block font-[var(--font-mono)] text-[9px] opacity-60">
                      {NUMEROS[rang]}
                    </span>
                    <span className="mt-[3px] block text-[11px] tracking-[.08em] uppercase">
                      {LIBELLE_DOCTRINE[doctrine]}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--ink-note)]">
                Personne d’autre ne voit ce choix, seulement « prêt / pas prêt ».
              </p>

              <div className="mt-4 flex flex-col gap-1">
                {controles.map((controle) => (
                  <div
                    key={controle.libelle}
                    className="flex items-center gap-[9px] text-[11.5px]"
                    style={{ color: controle.fait ? 'var(--ink)' : 'var(--ink-faint)' }}
                  >
                    <span className="w-[11px] font-[var(--font-mono)] text-[11px]">
                      {controle.fait ? '×' : '·'}
                    </span>
                    <span>{controle.libelle}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => agir(() => declarerPret({ jeton, pret: !salon.moi.pret }))}
                className={`mt-[14px] w-full cursor-pointer border border-[var(--ink)] p-[13px] text-[11px] tracking-[.22em] uppercase ${
                  salon.moi.pret
                    ? 'bg-[var(--ink)] text-[var(--paper)]'
                    : 'hover:bg-[rgba(42,33,24,.08)]'
                }`}
              >
                {salon.moi.pret ? 'je ne suis plus prêt' : 'me déclarer prêt'}
              </button>

              {salon.moi.createur ? (
                <>
                  <button
                    type="button"
                    disabled={!tousPrets}
                    onClick={() => agir(() => lancer({ jeton }))}
                    className={`mt-2 w-full border p-[13px] text-[11px] tracking-[.22em] uppercase ${
                      tousPrets
                        ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
                        : 'cursor-not-allowed border-[rgba(42,33,24,.3)] bg-[rgba(42,33,24,.12)] text-[var(--ink-faint)]'
                    }`}
                  >
                    lancer la saison — irréversible
                  </button>
                  <p className="mt-[7px] text-center text-[10.5px] text-[var(--ink-faint)]">
                    {tousPrets
                      ? 'la graine des pays neutres sera tirée au lancement'
                      : `il manque ${manquants} condition${manquants > 1 ? 's' : ''}`}
                  </p>
                </>
              ) : (
                <p className="mt-[10px] text-center text-[10.5px] text-[var(--ink-faint)]">
                  seul le fondateur lance la saison.
                </p>
              )}
            </aside>
          </div>

          {erreur && (
            <p className="mx-[30px] mt-4 border border-[var(--critique)] px-3 py-2 text-[12.5px]">
              {erreur}
            </p>
          )}

          <div className="mx-[30px] mt-[14px] flex items-center justify-between border-t border-[rgba(42,33,24,.35)] pt-[9px] pb-[14px] text-[10px] tracking-[.16em] text-[var(--ink-faint)] uppercase">
            <span>la partie commence quand le fondateur lance — pas avant</span>
            <span className="font-[var(--font-mono)] tracking-[.12em]">salon {salon.code}</span>
          </div>
        </div>
        </Journal>
      </div>

      {enLancement && (
        <Lancement
          region={salon.regionJouable}
          cadence={cadence}
          joueurs={salon.joueurs.length}
          surFin={versPlateau}
        />
      )}
    </>
  );
}

function encreDeStatut(aMoi: boolean, prise: boolean, nation: string): string {
  if (aMoi) return 'var(--notable)';
  if (prise) return 'var(--critique)';
  if (nation === 'États-Unis') return 'var(--notable)';
  return 'var(--paper-dim)';
}
