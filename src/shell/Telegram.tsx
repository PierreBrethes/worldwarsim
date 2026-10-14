import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { telegraphese } from './OffSeason';

/**
 * **Le télégramme** : l'invitation, son aperçu à la fondation, et le refus. Chaque ligne est une
 * phrase française qui se tape en capitales et finit par STOP ; l'assistance vocale lit les
 * phrases d'origine, sans les STOP.
 */
export function Telegram({
  lines,
  code,
  origin,
  filed,
  refusal = false,
  fresh = -1,
  stamp,
}: {
  lines: ReadonlyArray<string>;
  code: string;
  origin: string;
  filed: string;
  refusal?: boolean;
  /** La ligne que la dernière retouche de l'ordre vient de réécrire. */
  fresh?: number;
  stamp?: ReactNode;
}) {
  const words = lines.join(' ').split(/\s+/).length + lines.length;
  return (
    <article className="telegram" aria-label={fr.table.telegram.label(lines.join('. '))}>
      <header className="tg-head">
        <span className="t">
          {fr.table.telegram.title}
          <small>{fr.table.telegram.service}</small>
        </span>
        <span className="num" style={{ fontSize: 11 }}>
          {fr.table.telegram.number(code)}
        </span>
      </header>
      <div className="tg-grid" aria-hidden>
        <span>
          {fr.table.telegram.origin}
          <b>{origin}</b>
        </span>
        <span>
          {fr.table.telegram.words}
          <b>{words}</b>
        </span>
        <span>
          {fr.table.telegram.filed}
          <b>{filed}</b>
        </span>
        <span>
          {refusal ? fr.table.telegram.answer : fr.table.telegram.link}
          <b>{refusal ? fr.table.telegram.none : `/rejoindre/${code}`}</b>
        </span>
      </div>
      <div className="tg-body" aria-hidden>
        {lines.map((line, index) => (
          <p key={`${index}${line}`} className={`tape ${index === fresh ? 'fresh' : ''}`}>
            {telegraphese(line)} {fr.table.telegram.stop}
          </p>
        ))}
      </div>
      <div className="tg-foot" aria-hidden>
        <span>{refusal ? fr.table.telegram.regrets : fr.table.telegram.paid}</span>
        <span>{refusal ? fr.table.telegram.file : fr.table.telegram.valid}</span>
      </div>
      {stamp}
    </article>
  );
}
