import { useNavigate, useRouter } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import { errorMessage } from '@/data/errors';

/**
 * The routes' fallback screen: a load or subscription error must never end as a blank page.
 * A coded error explains itself in French; the rest admits to being unexpected and leaves
 * two exits — retry, or go back home.
 */
export function ErrorScreen({ error, reset }: { error: unknown; reset?: () => void }) {
  const navigate = useNavigate();
  const router = useRouter();
  const message = errorMessage(error) ?? fr.unexpectedError;
  if (errorMessage(error) === null) console.error(error);

  return (
    <div className="flex h-full items-center justify-center bg-[var(--desk)] px-6">
      <div className="hud paper-grain w-[520px] max-w-full border border-[var(--ink)] px-[30px] pt-[22px] pb-6 text-center">
        <p className="text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">{fr.errorScreen.kicker}</p>
        <h1 className="mt-3 border-t-2 border-b border-[var(--ink)] py-3 font-[var(--font-display)] text-[26px] leading-none font-extrabold tracking-[.03em] text-[var(--ink)] uppercase">
          {fr.errorScreen.title}
        </h1>
        <p className="mt-4 text-[13px] leading-[1.55] text-[var(--ink)]">{message}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => {
              reset?.();
              void router.invalidate();
            }}
            className="flex-1 cursor-pointer border border-[var(--ink)] bg-[var(--ink)] py-[10px] text-[10px] tracking-[.2em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)]"
          >
            {fr.errorScreen.retry}
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: '/accueil' })}
            className="flex-1 cursor-pointer border border-[var(--ink)] py-[10px] text-[10px] tracking-[.2em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.errorScreen.backHome}
          </button>
        </div>
      </div>
    </div>
  );
}
