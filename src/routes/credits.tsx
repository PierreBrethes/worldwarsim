import { createFileRoute } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import { Masthead } from '@/shell/Masthead';
import { ThickRuleInverse, usePageTurn } from '@/shell/Newspaper';
import { EntrySheet, SheetExit } from '@/shell/EntrySheet';

export const Route = createFileRoute('/credits')({ component: Credits });

const ExternalLink = ({ href, children }: { href: string; children: string }) => (
  <a href={href} rel="noreferrer" className="underline underline-offset-4">
    {children}
  </a>
);

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
            <p className="text-[12px]">
              {source.licenceUrl && <ExternalLink href={source.licenceUrl}>licence</ExternalLink>}
              {source.licenceUrl && source.sourceUrl && ' · '}
              {source.sourceUrl && <ExternalLink href={source.sourceUrl}>source</ExternalLink>}
            </p>
          </li>
        ))}
      </ul>
      <p className="mx-(--sheet-pad) pb-3 text-[12px] text-[var(--ink-note)]">
        {fr.credits.software}
      </p>
      <SheetExit />
    </EntrySheet>
  );
}
