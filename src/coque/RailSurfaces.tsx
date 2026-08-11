import { Link } from '@tanstack/react-router';

const SURFACES = [
  { code: '4.1', titre: 'Journal', chemin: null },
  { code: '4.2', titre: 'Mouvements', chemin: null },
  { code: '4.3', titre: 'Envoi', chemin: null },
  { code: '4.4', titre: 'Plateau', chemin: '/plateau' },
  { code: '4.5', titre: 'Nation', chemin: null },
  { code: '4.6', titre: 'Production', chemin: null },
  { code: '4.7', titre: 'Rejeu', chemin: null },
  { code: '4.8', titre: 'Doctrine', chemin: null },
  { code: '4.9', titre: 'Espionnage', chemin: null },
] as const;

export function RailSurfaces({ saison }: { saison: number }) {
  return (
    <nav className="flex w-[52px] shrink-0 flex-col justify-between bg-[var(--desk)] py-2">
      <ul>
        {SURFACES.map((surface) => (
          <li key={surface.code}>
            {surface.chemin ? (
              <Link
                to={surface.chemin}
                title={surface.titre}
                className="flex h-[38px] items-center justify-center border-l-2 border-transparent font-[var(--font-mono)] text-[11px] text-[var(--paper-dim)]"
                activeProps={{
                  className:
                    'flex h-[38px] items-center justify-center border-l-2 border-[var(--notable)] bg-[var(--paper)] font-[var(--font-mono)] text-[11px] text-[var(--ink)]',
                }}
              >
                {surface.code}
              </Link>
            ) : (
              <span
                title={`${surface.titre} — à venir`}
                className="flex h-[38px] items-center justify-center font-[var(--font-mono)] text-[11px] text-[var(--paper-dim)] opacity-45"
              >
                {surface.code}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="text-center font-[var(--font-mono)] text-[9px] text-[#6b6252]">S.{saison}</div>
    </nav>
  );
}
