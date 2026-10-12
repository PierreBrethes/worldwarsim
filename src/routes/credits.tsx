import { Link, createFileRoute } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import { Masthead } from '@/shell/Masthead';
import { ThickRuleInverse, usePageTurn } from '@/shell/Newspaper';
import { EntrySheet, TOUCH_TARGET } from '@/shell/EntrySheet';

export const Route = createFileRoute('/credits')({ component: Credits });

export function Credits() {
  const { turning } = usePageTurn();
  return (
    <EntrySheet width={620} turning={turning}>
      <div className="px-(--sheet-pad) pt-[18px] pb-[16px] text-center">
        <Masthead date={fr.auth.dateline} wordmarkMax={54} />
        <p className="mt-[13px] text-[11.5px] tracking-[.2em] text-[var(--ink-note)] uppercase">
          {fr.credits.title} · {fr.credits.tagline}
        </p>
      </div>
      <ThickRuleInverse margin="var(--sheet-pad)" />
      <ul className="mx-(--sheet-pad) py-4 text-[13px] leading-[1.5]">
        {fr.credits.sources.map((source) => (
          <li key={source.name} className="border-b border-(color:--ink)/25 py-3 last:border-0">
            <h2 className="font-(family-name:--font-display) text-[16px] font-bold">
              {source.name}
            </h2>
            <p>{source.use}</p>
            <p className="text-[var(--ink-note)]">{source.licence}</p>
            {source.attribution && (
              <p className="font-(family-name:--font-mono) text-[12px]">{source.attribution}</p>
            )}
          </li>
        ))}
      </ul>
      <p className="mx-(--sheet-pad) pb-3 text-[12px] text-[var(--ink-note)]">
        {fr.credits.software}
      </p>
      <div className="mx-(--sheet-pad) pb-2 text-center">
        <Link
          to="/"
          className={`text-[11.5px] text-[var(--ink-note)] underline underline-offset-4 hover:text-[var(--ink)] ${TOUCH_TARGET}`}
        >
          {fr.credits.back}
        </Link>
      </div>
    </EntrySheet>
  );
}
