import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { convexClient } from '@/data/convexClient';
import { useSession } from '@/data/session';
import { FinalEditionPage } from '@/shell/final-edition/FinalEditionPage';
import { OffSeasonPage } from '@/shell/OffSeason';

export const Route = createFileRoute('/edition/$id')({ component: Edition });

function Edition() {
  const { id } = Route.useParams();
  return convexClient ? (
    <EditionPage editionId={id as Id<'finalEditions'>} />
  ) : (
    <OffSeasonPage>
      <p className="note" style={{ padding: 40, color: 'var(--paper)' }}>
        {fr.auth.noBackend}
      </p>
    </OffSeasonPage>
  );
}

/**
 * **Une édition finale relue depuis l'accueil** (#455) : elle ne lit que l'archive, si bien
 * qu'elle se relit même la saison détruite ; la carte est le rendu 2D de l'archive, le plateau
 * three.js n'existant plus. Le serveur la refuse à qui n'a pas joué la saison.
 */
export function EditionPage({ editionId }: { editionId: Id<'finalEditions'> }) {
  const token = useSession() ?? '';
  const edition = useQuery(api.finalEdition.read, { token, editionId });
  return (
    <div className="fixed inset-0 flex bg-[var(--map-desk)] p-0 md:px-[44px] md:py-[18px]">
      {edition !== undefined && <FinalEditionPage edition={edition} />}
    </div>
  );
}
