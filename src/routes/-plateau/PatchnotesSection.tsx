import { useState } from 'react';
import { fr } from '@/i18n/fr';
import { usePatchnotes, useUnreadPatchnotes } from '@/data/patchnotes';
import { monthsOf } from '@/domain/patchnotes';
import { Stamp } from '@/shell/Stamp';
import { PatchnotesReader } from './PatchnotesReader';

/**
 * **Les mises à jour, en tête des Réglages** (liasse, décision du 01/11) : le dernier bulletin en
 * vignette sur sa pile, les précédents sur une frise groupée par mois. Rien ne s'ouvre d'office :
 * le non lu se voit au point rouge du bouton des Réglages et au tampon d'ici.
 */
export function PatchnotesSection() {
  const notes = usePatchnotes();
  const unread = useUnreadPatchnotes();
  const [open, setOpen] = useState<string | null>(null);
  const [top, ...earlier] = notes;

  return (
    <div className="mb-[18px] border-b border-(color:--ink)/22 pb-[14px]">
      <span className="text-[13.5px] text-[var(--ink)]">{fr.patchnotes.label}</span>
      {top === undefined ? (
        <p className="mt-2 font-(family-name:--font-text) text-[13px] leading-[1.4] text-[var(--ink-soft)] italic">
          {fr.patchnotes.empty}
        </p>
      ) : (
        <>
          <p className="mt-[3px] text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
            {fr.patchnotes.note}
          </p>
          <button
            type="button"
            onClick={() => setOpen(top.date)}
            className="mt-[10px] grid w-full cursor-pointer grid-cols-[132px_1fr] items-start gap-3 text-left"
          >
            <img
              src={top.image}
              alt=""
              className="block aspect-[297/210] w-[132px] border border-[var(--ink)] object-cover"
              style={{
                boxShadow:
                  '3px 3px 0 var(--paper-pile), 6px 6px 0 var(--paper-pile-2), 6px 6px 0 1px color-mix(in srgb, var(--ink) 40%, transparent)',
              }}
            />
            <span>
              <span className="block font-(family-name:--font-mono) text-[10.5px] leading-none text-[var(--ink-soft)]">
                {fr.patchnotes.dateLong(top.date)}
              </span>
              <span className="mt-1 block font-(family-name:--font-display) text-[15.5px] leading-[1.15] font-bold">
                {top.title}
              </span>
              {unread.has(top.date) && (
                <span className="mt-2 block">
                  <Stamp label={fr.patchnotes.unread} tone="critical" size="small" />
                </span>
              )}
            </span>
          </button>
          {earlier.length > 0 && (
            <ol className="relative mt-[14px] pl-1">
              <i className="absolute top-[6px] bottom-[6px] left-[9px] border-l border-(color:--ink)/45" />
              {monthsOf(earlier).map(([month, rows]) => (
                <li key={month}>
                  <div className="py-[6px] pl-[22px] text-[9px] leading-none font-semibold tracking-[.18em] text-[var(--ink-soft)] uppercase">
                    {fr.patchnotes.month(month)}
                  </div>
                  <ol>
                    {rows.map((note) => (
                      <li key={note.date}>
                        <button
                          type="button"
                          onClick={() => setOpen(note.date)}
                          className="group grid w-full cursor-pointer grid-cols-[12px_44px_1fr_auto] items-baseline gap-2 py-[5px] text-left"
                        >
                          <i
                            className="relative top-px h-[11px] w-[11px] rounded-full border-[1.5px] border-[var(--ink)]"
                            style={
                              unread.has(note.date)
                                ? { background: 'var(--critical)', borderColor: 'var(--critical)' }
                                : { background: 'var(--paper)' }
                            }
                          />
                          <span className="font-(family-name:--font-mono) text-[10.5px] leading-none text-[var(--ink-soft)]">
                            {fr.patchnotes.dateDots(note.date)}
                          </span>
                          <span
                            className={`font-(family-name:--font-display) text-[13px] leading-[1.2] group-hover:underline group-hover:underline-offset-[3px] ${unread.has(note.date) ? 'font-bold' : 'font-medium'}`}
                          >
                            {note.title}
                          </span>
                          {unread.has(note.date) ? (
                            <Stamp label={fr.patchnotes.unread} tone="critical" size="small" />
                          ) : (
                            <span />
                          )}
                        </button>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
      {open !== null && (
        <PatchnotesReader
          notes={notes}
          startDate={open}
          unread={unread}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
