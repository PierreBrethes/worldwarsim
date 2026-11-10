import { useId, useRef, useState, type FormEvent } from 'react';
import { fr } from '@/i18n/fr';
import { GAME_CODE_LENGTH, gameCodeEntry } from '@/domain/off-season';
import './code-field.css';

/**
 * **Le code d'invitation : six cases, et aucun bouton.** Un seul champ, dessiné comme six cases —
 * six champs casseraient le collage, la saisie automatique et la correction, que tout le monde
 * attend d'un champ. L'invitation s'ouvre au sixième caractère, et la ligne sous les cases le dit
 * avant la frappe : la page ne change jamais sans l'avoir annoncé. Chaque caractère tapé est
 * frappé dans sa case (`data-struck`, `code-field.css`) ; ce que la page fait du code complet,
 * un coupon qui part sur la une, est son affaire (`onOpen`).
 *
 * Rien n'est grisé : une lettre qu'aucun code ne porte est dite en rouge à la frappe, par
 * l'alphabet même du tirage (`gameCodeEntry`), et un code incomplet validé dit ce qui lui manque.
 * Que le code ouvre une partie, c'est la page d'invitation qui le dit, avec la phrase du serveur.
 */
export function CodeField({
  label,
  onOpen,
}: {
  readonly label: string;
  readonly onOpen: (code: string) => void;
}) {
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [asked, setAsked] = useState(false);
  const [struck, setStruck] = useState<number | null>(null);
  const entry = gameCodeEntry(typed);
  const missing = GAME_CODE_LENGTH - entry.typed.length;

  /** Pas de `maxlength` : un collage « ·K7Q2PX » porte une espace de tête, que l'attribut
   *  compterait avant qu'on ne la retire. */
  const accept = (raw: string) => {
    const next = gameCodeEntry(raw);
    /** Une frappe pose un caractère, un collage plusieurs : il ne rejoue pas six frappes. */
    setStruck(next.typed.length === entry.typed.length + 1 ? next.typed.length - 1 : null);
    setTyped(next.typed);
    setAsked(false);
    if (next.code !== null) onOpen(next.code);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (entry.code !== null) onOpen(entry.code);
    else {
      setAsked(true);
      field.current?.focus();
    }
  };

  const said = fr.codeField;
  const refusal =
    entry.stray !== null
      ? said.stray(entry.stray)
      : asked && missing > 0
        ? said.missing(missing)
        : null;

  return (
    <form className="code-field" onSubmit={submit} autoComplete="off" noValidate>
      <label htmlFor={id}>{label}</label>
      <div className="code-cells">
        {Array.from({ length: GAME_CODE_LENGTH }, (_, index) => (
          <span
            key={index}
            aria-hidden
            data-full={index < entry.typed.length ? '' : undefined}
            data-struck={index === struck ? '' : undefined}
            style={{ left: `${index * CELL_EM}em` }}
          />
        ))}
        <input
          ref={field}
          id={id}
          value={entry.typed}
          aria-describedby={`${id}-say`}
          aria-invalid={refusal === null ? undefined : true}
          onChange={(event) => accept(event.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />
      </div>
      <p id={`${id}-say`} className="code-say" data-refusal={refusal === null ? undefined : ''}>
        <span aria-live="polite">{refusal ?? said.hint}</span>
      </p>
    </form>
  );
}

/** Le pas d'une case, en `em` du champ (`code-field.css` y accorde l'interlettrage). */
const CELL_EM = 2.5;
