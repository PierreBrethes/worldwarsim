import { Link, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { RecherchePlateau } from '@/routes/plateau';

export function RailSurfaces({ saison }: { saison: number }) {
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  const commun: RecherchePlateau = recherche.pays ? { pays: recherche.pays } : {};

  const surfaces: ReadonlyArray<{
    titre: string;
    libelle: string;
    icone: ReactNode;
    cible: RecherchePlateau;
    active: boolean;
  }> = [
    {
      titre: 'Journal d’événements',
      libelle: 'journal',
      icone: <IconeJournal />,
      cible: { ...commun, ...(recherche.vue ? { vue: recherche.vue } : {}), modale: 'journal' },
      active: recherche.modale === 'journal',
    },
    {
      titre: 'Mouvements en cours',
      libelle: 'mouvts',
      icone: <IconeMouvements />,
      cible: { ...commun, vue: 'mouvements' },
      active: recherche.vue === 'mouvements' && !recherche.modale,
    },
    {
      titre: 'Envoi d’un mouvement',
      libelle: 'envoi',
      icone: <IconeEnvoi />,
      cible: { ...commun, vue: 'mouvements', modale: 'envoi' },
      active: recherche.modale === 'envoi',
    },
    {
      titre: 'Plateau',
      libelle: 'plateau',
      icone: <IconePlateau />,
      cible: commun,
      active: !recherche.modale && recherche.vue !== 'mouvements',
    },
    {
      titre: 'Ma nation',
      libelle: 'nation',
      icone: <IconeNation />,
      cible: { ...commun, ...(recherche.vue ? { vue: recherche.vue } : {}), modale: 'nation' },
      active: recherche.modale === 'nation',
    },
  ];

  const aVenir: ReadonlyArray<{ titre: string; libelle: string; icone: ReactNode }> = [
    { titre: 'Production — à venir', libelle: 'prod.', icone: <IconeProduction /> },
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
          search={{ ...commun, modale: 'reglages' }}
          title="Réglages"
          className={
            recherche.modale === 'reglages'
              ? 'flex h-[34px] w-full items-center justify-center border-l-2 border-[var(--notable)] bg-[var(--paper)] text-[var(--ink)]'
              : 'flex h-[34px] w-full items-center justify-center border-l-2 border-transparent text-[var(--paper-dim)] hover:text-[var(--paper)]'
          }
        >
          <IconeReglages />
        </Link>
        <div className="text-center font-[var(--font-mono)] text-[9px] text-[#6b6252]">S.{saison}</div>
      </div>
    </nav>
  );
}

function Glyphe({ children }: { children: ReactNode }) {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      {children}
    </svg>
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

function IconeJournal() {
  return (
    <Glyphe>
      <rect x="3" y="3.5" width="14" height="13" />
      <path d="M5 7h10M5 9.5h4.5M5 12h4.5M5 14.5h4.5M11.5 9.5H15v5h-3.5z" />
    </Glyphe>
  );
}

function IconeMouvements() {
  return (
    <Glyphe>
      <path d="M3 15.5C6 7.5 12 5.5 15.5 7.5" />
      <path d="M16.5 8.5l-.5-3.2-3 1.2" />
    </Glyphe>
  );
}

function IconeEnvoi() {
  return (
    <Glyphe>
      <path d="M3 9.5L17 4l-5 13-2.2-5.3z" />
      <path d="M9.8 11.7L17 4" />
    </Glyphe>
  );
}

function IconePlateau() {
  return (
    <Glyphe>
      <path d="M5.5 6h9l2.5 8h-14z" />
      <path d="M10 6v8M4.4 10.5h11.2" />
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
