import { createFileRoute } from '@tanstack/react-router';
import type { SeasonMode } from '@/domain/season-mode';
import { Found } from './-fonder/Found';

type Search = { mode?: SeasonMode; theatre?: string };

export const Route = createFileRoute('/fonder')({
  component: Found,
  /** « Composer à mon tour », depuis un refus (choix 19) : les réglages de la partie refusée. */
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...(search.mode === 'blitz' || search.mode === 'mondiale' ? { mode: search.mode } : {}),
    ...(typeof search.theatre === 'string' ? { theatre: search.theatre } : {}),
  }),
});
