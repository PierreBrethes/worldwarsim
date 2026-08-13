import { Link, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { VueJoueur } from '@/domaine/vue-joueur';
import type { Modale, RecherchePlateau } from '@/routes/plateau';
import { basculerModale, modaleOuverte } from '@/routes/plateau';
import { Glyphe } from './Glyphe';
import { useHorloge } from './horloge';

export function RailSurfaces({
  saison,
  chargeeA,
}: {
  saison: VueJoueur['saison'];
  chargeeA: number;
}) {
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  // La fin de saison se compte en jours : la minute suffit, et le rail n'a pas à se
  // redessiner chaque seconde pour une infobulle.
  const maintenant = useHorloge(60_000);
  const restantMinutes = Math.max(
    0,
    (saison.dureeHeures - saison.ecouleHeures) * 60 - (maintenant - chargeeA) / 60_000,
  );

  // Le rail est un jeu de bascules, pas une navigation : cliquer une surface déjà
  // ouverte la retire de la pile, et l'état nu (carte seule) n'a pas besoin d'entrée « plateau ».
  const bascule = (nom: Modale): RecherchePlateau => basculerModale(recherche, nom);

  const surfaces: ReadonlyArray<{
    titre: string;
    libelle: string;
    icone: ReactNode;
    cible: RecherchePlateau;
    active: boolean;
  }> = [
    {
      titre: 'Troupes — inventaire et envoi',
      libelle: 'troupes',
      icone: <IconeTroupes />,
      cible: bascule('troupes'),
      active: modaleOuverte(recherche, 'troupes'),
    },
    {
      titre: 'Production — recrutement d’unités',
      libelle: 'prod.',
      icone: <IconeProduction />,
      cible: bascule('production'),
      active: modaleOuverte(recherche, 'production'),
    },
    {
      titre: 'Ma nation',
      libelle: 'nation',
      icone: <IconeNation />,
      cible: bascule('nation'),
      active: modaleOuverte(recherche, 'nation'),
    },
  ];

  const aVenir: ReadonlyArray<{ titre: string; libelle: string; icone: ReactNode }> = [
    { titre: 'Rejeu de bataille — à venir', libelle: 'rejeu', icone: <IconeRejeu /> },
    { titre: 'Doctrine — à venir', libelle: 'doctrine', icone: <IconeDoctrine /> },
    { titre: 'Espionnage — à venir', libelle: 'espion.', icone: <IconeEspionnage /> },
  ];

  return (
    <nav className="hud flex w-[52px] shrink-0 flex-col justify-between bg-[var(--desk)] py-2">
      <ul>
        {surfaces.map((surface) => (
          <li key={surface.libelle}>
            <Link
              to="/plateau"
              search={surface.cible}
              title={surface.titre}
              className={
                surface.active
                  ? 'flex h-[46px] flex-col items-center justify-center gap-[3px] border-l-2 border-[var(--notable)] bg-[var(--paper)] text-[var(--ink)]'
                  : 'flex h-[46px] flex-col items-center justify-center gap-[3px] border-l-2 border-transparent text-[var(--paper-dim)] hover:text-[var(--paper)]'
              }
            >
              {surface.icone}
              <span className="text-[7px] tracking-[.14em] uppercase">{surface.libelle}</span>
            </Link>
          </li>
        ))}
        {aVenir.map((surface) => (
          <li key={surface.libelle}>
            <span
              title={surface.titre}
              className="flex h-[46px] flex-col items-center justify-center gap-[3px] text-[var(--paper-dim)] opacity-40"
            >
              {surface.icone}
              <span className="text-[7px] tracking-[.14em] uppercase">{surface.libelle}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center gap-2">
        <Link
          to="/plateau"
          search={bascule('reglages')}
          title="Réglages"
          className={
            modaleOuverte(recherche, 'reglages')
              ? 'flex h-[34px] w-full items-center justify-center border-l-2 border-[var(--notable)] bg-[var(--paper)] text-[var(--ink)]'
              : 'flex h-[34px] w-full items-center justify-center border-l-2 border-transparent text-[var(--paper-dim)] hover:text-[var(--paper)]'
          }
        >
          <IconeReglages />
        </Link>
        <div
          title={`saison ${saison.numero} — fin dans ${Math.floor(restantMinutes / 60)} h ${String(
            Math.floor(restantMinutes % 60),
          ).padStart(2, '0')}`}
          className="text-center font-[var(--font-mono)] text-[9px] text-[#6b6252]"
        >
          S.{saison.numero}
        </div>
      </div>
    </nav>
  );
}

function IconeReglages() {
  return (
    <Glyphe>
      <path d="M4 6.5h12M4 13.5h12" />
      <path d="M8 4.5v4M13 11.5v4" />
    </Glyphe>
  );
}

function IconeTroupes() {
  return (
    <Glyphe>
      <circle cx="10" cy="4.6" r="2.1" />
      <path d="M5.5 16.5v-4.2c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4v4.2" />
      <path d="M3 16.5h14" />
    </Glyphe>
  );
}

function IconeNation() {
  return (
    <Glyphe>
      <path d="M6 17V3.5" />
      <path d="M6 4h9l-2.2 3L15 10H6" />
    </Glyphe>
  );
}

function IconeProduction() {
  return (
    <Glyphe>
      <path d="M3.5 16.5V8.5l4 3v-3l4 3v-3l4 3v-8h1v13z" />
    </Glyphe>
  );
}

function IconeRejeu() {
  return (
    <Glyphe>
      <path d="M6.5 4.5l9 5.5-9 5.5z" />
    </Glyphe>
  );
}

function IconeDoctrine() {
  return (
    <Glyphe>
      <circle cx="10" cy="10" r="6.2" />
      <circle cx="10" cy="10" r="2" />
    </Glyphe>
  );
}

function IconeEspionnage() {
  return (
    <Glyphe>
      <path d="M2.5 10C6 5 14 5 17.5 10 14 15 6 15 2.5 10z" />
      <circle cx="10" cy="10" r="2.2" />
    </Glyphe>
  );
}
