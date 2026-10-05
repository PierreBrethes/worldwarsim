import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { fr } from '@/i18n/fr';
import boardBackdrop from '@/shell/board-backdrop.jpg';
import { EntrySheet } from '@/shell/EntrySheet';
import { FilmTrailer } from '@/shell/FilmTrailer';
import { Masthead } from '@/shell/Masthead';
import { LOOP_POSTER_URL, LOOP_URL } from '@/shell/media';
import { ThickRule, usePageTurn } from '@/shell/Newspaper';
import { Stamp } from '@/shell/Stamp';

const CODE_LENGTH = 6;
const CODE_ID = 'front-code';
const HINT_ID = 'front-code-hint';

/**
 * **La une : ce qu'un visiteur sans compte voit à l'adresse nue** (maquette 2a du 03/10). Une
 * première page posée sur le bureau, et deux portes seulement — un code d'invitation, ou un
 * compte déjà ouvert. Pas de troisième : on n'entre pas seul (marque-1c).
 *
 * **Le fond est la table de carte, pas le film** : la boucle est déjà la photo de une, et la
 * jouer deux fois coûterait deux décodeurs pour la même image.
 *
 * Sur téléphone, l'encadré des portes tombe en bas de page, après les brèves — l'ordre de la
 * maquette. Une barre collée en bas les tient à portée tant qu'il n'est pas à l'écran.
 */
export function FrontPage() {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
  const desk = useRef<HTMLElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const deskInView = useInView(desk);
  const today = new Date();

  const signIn = () => turn(() => void navigate({ to: '/connexion' }));
  const openInvitation = (code: string) =>
    turn(() => void navigate({ to: '/rejoindre/$code', params: { code } }));

  const toCode = () => {
    codeField.current?.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
    codeField.current?.focus({ preventScroll: true });
  };

  return (
    <div className="relative h-full">
      <EntrySheet width={1000} turning={turning} backdrop="map">
        <div className="px-(--sheet-pad) pt-[18px] pb-[22px]">
          <Masthead
            wordmarkMax={64}
            dateline={
              <>
                <span className="md:hidden">{fr.front.shortDateline}</span>
                <span className="max-md:hidden">{fr.masthead.dateline}</span>
              </>
            }
            date={
              <>
                <span className="md:hidden">{fr.front.shortDate(today)}</span>
                <span className="max-md:hidden">{fr.front.date(today)}</span>
              </>
            }
          />

          <div className="mt-[18px] flex flex-col md:grid md:grid-cols-[1.6fr_1fr] md:gap-x-7">
            <figure className="m-0">
              <div
                className="relative aspect-video overflow-hidden border border-[var(--ink)] bg-[var(--desk)] bg-cover bg-center"
                style={{ backgroundImage: `url(${boardBackdrop})` }}
              >
                <LoopPhoto />
                <FilmTrailer plate className="absolute right-0 bottom-0 border-r-0 border-b-0" />
              </div>
              <figcaption className="mt-[7px] font-(family-name:--font-text) text-[12.5px] leading-[1.45] text-[var(--ink-note)] italic">
                {fr.front.caption}
              </figcaption>
            </figure>

            <div className="max-md:contents md:border-l md:border-(color:--ink)/45 md:pl-7">
              <h1 className="mt-5 font-(family-name:--font-display) text-[34px] leading-[1.02] font-extrabold tracking-[.01em] max-md:text-[27px] md:mt-0">
                {fr.front.headline}
              </h1>
              <p className="mt-3 font-(family-name:--font-text) text-[15.5px] leading-[1.5]">
                {fr.front.lede}
              </p>
              <section
                ref={desk}
                aria-label={fr.front.stamp}
                className="mt-7 border border-[var(--ink)] p-[3px] max-md:order-last md:mt-4"
              >
                <InvitationDesk codeField={codeField} onCode={openInvitation} onSignIn={signIn} />
              </section>
            </div>

            <div className="mt-6 md:col-span-2">
              <ThickRule margin={0} />
              <div className="md:grid md:grid-cols-3">
                {fr.front.briefs.map((brief, index) => (
                  <section
                    key={brief.kicker}
                    className={`py-3 md:px-6 md:first:pl-0 md:last:pr-0 ${
                      index > 0
                        ? 'max-md:border-t max-md:border-(color:--ink)/30 md:border-l md:border-(color:--ink)/45'
                        : ''
                    }`}
                  >
                    <h2 className="eyebrow">{brief.kicker}</h2>
                    <p className="mt-1 font-(family-name:--font-text) text-[14.5px] leading-[1.5]">
                      {brief.text}
                    </p>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </EntrySheet>

      {!deskInView && turning !== 'exit' && (
        <nav className="fixed inset-x-0 bottom-0 z-10 flex gap-[10px] border-t border-[var(--ink)] bg-[var(--paper)] px-3 pt-[10px] pb-[calc(10px+var(--safe-bottom))] md:hidden">
          <button
            type="button"
            onClick={toCode}
            className="min-h-11 flex-1 cursor-pointer border border-[var(--ink)] bg-[var(--ink)] text-[11px] tracking-[.22em] text-[var(--paper)] uppercase"
          >
            {fr.front.haveCode}
          </button>
          <button
            type="button"
            onClick={signIn}
            className="min-h-11 flex-1 cursor-pointer border border-[var(--ink)] text-[11px] tracking-[.22em] text-[var(--ink)] uppercase"
          >
            {fr.front.signIn}
          </button>
        </nav>
      )}
    </div>
  );
}

/**
 * **La boucle en photo de une**, muette et sans fin. Sous mouvement réduit, l'image d'attente
 * seule. Sans médias — en local, ils ne sont pas dans le dépôt — la vue de la table reste dessous
 * et la photo ne laisse pas de trou.
 */
function LoopPhoto() {
  const [still] = useState(prefersReducedMotion);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  const layer = 'absolute inset-0 h-full w-full object-cover';
  return still ? (
    <img className={layer} src={LOOP_POSTER_URL} alt="" onError={() => setFailed(true)} />
  ) : (
    <video
      className={layer}
      src={LOOP_URL}
      poster={LOOP_POSTER_URL}
      autoPlay
      muted
      loop
      playsInline
      disablePictureInPicture
      aria-hidden
      tabIndex={-1}
      onError={() => setFailed(true)}
    />
  );
}

/** L'encadré des deux portes : le code d'invitation, puis la connexion. */
function InvitationDesk({
  codeField,
  onCode,
  onSignIn,
}: {
  codeField: RefObject<HTMLInputElement | null>;
  onCode: (code: string) => void;
  onSignIn: () => void;
}) {
  const [code, setCode] = useState('');
  const complete = code.length === CODE_LENGTH;

  /** Le code n'est pas jugé ici : c'est la page d'invitation qui refuse un mauvais code, avec la
   *  phrase du serveur. On n'écarte que ce qu'un collage apporte en trop. */
  const accept = (raw: string) =>
    setCode(raw.replace(/\s/g, '').toUpperCase().slice(0, CODE_LENGTH));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (complete) onCode(code);
  };

  return (
    <div className="relative border border-[var(--ink)] px-4 pt-7 pb-4 max-md:px-3 md:pt-6 md:pb-3">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--paper)]">
        <Stamp label={fr.front.stamp} />
      </div>

      <form onSubmit={submit}>
        <label
          htmlFor={CODE_ID}
          className="block font-(family-name:--font-display) text-[17px] font-bold"
        >
          {fr.front.codeTitle}
        </label>
        <CodeField inputRef={codeField} value={code} onChange={accept} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p id={HINT_ID} className="text-[11px] text-[var(--ink-note)]">
            {fr.front.codeHint}
          </p>
          <button
            type="submit"
            disabled={!complete}
            className={`min-h-11 shrink-0 border px-5 text-[11px] tracking-[.22em] uppercase ${
              complete
                ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
                : 'cursor-not-allowed border-transparent bg-(--ink)/45 text-[var(--paper)]'
            }`}
          >
            {fr.front.open}
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-(color:--ink)/35 pt-4 md:mt-3 md:pt-3">
        <h2 className="font-(family-name:--font-display) text-[16px] font-bold">
          {fr.front.accountTitle}
        </h2>
        <button
          type="button"
          onClick={onSignIn}
          className="min-h-11 shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[11px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {fr.front.signIn}
        </button>
      </div>
    </div>
  );
}

/**
 * **Un seul champ, dessiné comme six cases.** Six champs casseraient le collage, la saisie
 * automatique et la correction, que tout le monde attend d'un champ. Les cases sont un décor
 * derrière un champ transparent, et l'interlettrage pose chaque caractère au milieu de la
 * sienne : tout se compte en `em` de la même taille, et `ch` est la chasse de la mono.
 *
 * La taille suit la largeur de l'encadré (`cqi`) sans descendre sous seize pixels affichés —
 * en deçà, Safari zoome au focus. Elle est écrite sur le champ lui-même parce que la règle des
 * seize pixels de `index.css` vise l'élément et l'emporterait sur une taille héritée.
 *
 * **Le conteneur annule le zoom de la feuille** : `cqi` y est lu autrement par Chromium et par
 * WebKit (voir `index.css`), et les cases débordaient de l'encadré sous WebKit. À l'échelle 1
 * les deux moteurs s'accordent, et les longueurs du champ s'écrivent en pixels d'écran.
 */
function CodeField({
  inputRef,
  value,
  onChange,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="mt-3 @container [zoom:calc(1/var(--hud-scale))]">
      <div
        className="relative w-[16em] max-w-full focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--interaction)]"
        style={{ fontSize: CODE_FONT_SIZE, height: 'max(2.4em, 44px)' }}
      >
        {Array.from({ length: CODE_LENGTH }, (_, index) => (
          <span
            key={index}
            aria-hidden
            className={`absolute inset-y-0 w-[2.2em] border bg-(--ink)/5 ${
              index < value.length ? 'border-[var(--ink)]' : 'border-(color:--ink)/45'
            }`}
            style={{ left: `${index * CELL_EM}em` }}
          />
        ))}
        <input
          ref={inputRef}
          id={CODE_ID}
          aria-describedby={HINT_ID}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="absolute inset-0 h-full w-full border-0 bg-transparent font-(family-name:--font-mono) font-medium text-[var(--ink)] uppercase caret-[var(--ink)] outline-none"
          style={{
            fontSize: 'inherit',
            letterSpacing: `calc(${CELL_EM}em - 1ch)`,
            paddingLeft: `calc(${CELL_EM / 2 - GAP_EM / 2}em - .5ch)`,
            paddingRight: 0,
          }}
        />
      </div>
    </div>
  );
}

const CELL_EM = 2.5;
const GAP_EM = 0.3;
const CODE_FONT_SIZE = 'max(16px, min(calc(24px * var(--hud-scale)), calc(100cqi / 16)))';

const prefersReducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Vrai tant qu'un pixel de l'élément est à l'écran — et vrai aussi là où l'observateur manque,
 *  pour que la barre de secours ne recouvre jamais la page faute de pouvoir se retirer. */
function useInView(target: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = target.current;
    if (element === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry?.isIntersecting ?? false),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);
  return inView;
}
