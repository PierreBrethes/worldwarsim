import { Link, useSearch } from '@tanstack/react-router';
import type { RecherchePlateau } from '@/routes/plateau';

const A_VENIR = [
  { code: '4.5', titre: 'Nation' },
  { code: '4.6', titre: 'Production' },
  { code: '4.7', titre: 'Rejeu' },
  { code: '4.8', titre: 'Doctrine' },
  { code: '4.9', titre: 'Espionnage' },
] as const;

export function RailSurfaces({ saison }: { saison: number }) {
  const recherche = useSearch({ strict: false }) as RecherchePlateau;
  const commun: RecherchePlateau = recherche.pays ? { pays: recherche.pays } : {};

  const surfaces: ReadonlyArray<{ code: string; titre: string; cible: RecherchePlateau; active: boolean }> = [
    {
      code: '4.1',
      titre: 'Journal',
      cible: { ...commun, ...(recherche.vue ? { vue: recherche.vue } : {}), modale: 'journal' },
      active: recherche.modale === 'journal',
    },
    {
      code: '4.2',
      titre: 'Mouvements',
      cible: { ...commun, vue: 'mouvements' },
      active: recherche.vue === 'mouvements' && !recherche.modale,
    },
    {
      code: '4.3',
      titre: 'Envoi',
      cible: { ...commun, vue: 'mouvements', modale: 'envoi' },
      active: recherche.modale === 'envoi',
    },
    {
      code: '4.4',
      titre: 'Plateau',
      cible: commun,
      active: !recherche.modale && recherche.vue !== 'mouvements',
    },
  ];

  return (
    <nav className="flex w-[52px] shrink-0 flex-col justify-between bg-[var(--desk)] py-2">
      <ul>
        {surfaces.map((surface) => (
          <li key={surface.code}>
            <Link
              to="/plateau"
              search={surface.cible}
              title={surface.titre}
              className={
                surface.active
                  ? 'flex h-[38px] items-center justify-center border-l-2 border-[var(--notable)] bg-[var(--paper)] font-[var(--font-mono)] text-[11px] text-[var(--ink)]'
                  : 'flex h-[38px] items-center justify-center border-l-2 border-transparent font-[var(--font-mono)] text-[11px] text-[var(--paper-dim)]'
              }
            >
              {surface.code}
            </Link>
          </li>
        ))}
        {A_VENIR.map((surface) => (
          <li key={surface.code}>
            <span
              title={`${surface.titre} — à venir`}
              className="flex h-[38px] items-center justify-center font-[var(--font-mono)] text-[11px] text-[var(--paper-dim)] opacity-45"
            >
              {surface.code}
            </span>
          </li>
        ))}
      </ul>
      <div className="text-center font-[var(--font-mono)] text-[9px] text-[#6b6252]">S.{saison}</div>
    </nav>
  );
}
