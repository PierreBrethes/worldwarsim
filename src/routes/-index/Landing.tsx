import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useMapMotion } from '@/data/mapMotion';
import { fr } from '@/i18n/fr';
import { FilmTrailer } from '@/shell/FilmTrailer';
import { Wordmark } from '@/shell/Masthead';
import { Stamp } from '@/shell/Stamp';
import { Board } from './Board';
import { Bureau, BUREAU_ID, focusCode } from './Bureau';
import { Clippings } from './Clippings';
import type { LandingTable, Reading, SceneName, Story } from './table/table';
import './landing.css';

/**
 * **La une publique : on entre dans la photographie** (prototype `landing.html`, validé le
 * 14/10/2026). La une est posée sur le bureau ; sa photographie est un trou dans le papier, et
 * derrière il y a la table, vivante. Le défilement agrandit la photo jusqu'à l'écran, puis chaque
 * page est une coupure posée sur la carte, que la carte joue. Au bout, les deux portes : un code
 * d'invitation, ou un compte déjà ouvert.
 *
 * **La une s'affiche avant la carte** : la table (three.js, la feuille d'Europe, les GLB) se
 * charge après la première image, et sans WebGL la page reste lisible — les coupures portent
 * tout le texte. Aucune donnée de partie, aucune requête au serveur.
 */
export function Landing() {
  const motion = useMapMotion();
  const still = motion !== 'full';
  const canvas = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLDivElement>(null);
  const invite = useRef<HTMLDivElement>(null);
  const reading = useRef<Reading>({ scene: 'hero', progress: 0, focus: [0, 0] });
  const [table, setTable] = useState<LandingTable | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [scene, setScene] = useState<SceneName>('hero');
  const [progress, setProgress] = useState(0);
  const [engraved, setEngraved] = useState(false);
  const [age, setAge] = useState(0);
  const focusing = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(focusing.current), []);
  useEffect(() => table?.setSurveyAge(age), [table, age]);

  useEffect(() => {
    document.body.classList.add('lp-scroll');
    return () => document.body.classList.remove('lp-scroll');
  }, []);

  useEffect(() => {
    let photoBox: DOMRect | null = null;
    const measure = () => {
      if (front.current === null || photo.current === null) return;
      front.current.style.transform = '';
      photoBox = photo.current.getBoundingClientRect();
    };
    const update = () => {
      const page = front.current;
      if (page === null || photoBox === null) return;
      const wrap = page.closest('.lp-une-wrap') as HTMLElement;
      const p = clamp01(scrollY / Math.max(1, wrap.offsetHeight - innerHeight));
      const cx = photoBox.left + photoBox.width / 2;
      const cy = photoBox.top + photoBox.height / 2;
      const scale = Math.max(innerWidth / photoBox.width, innerHeight / photoBox.height) * 1.08;
      const e = still ? (p > 0.5 ? 1 : 0) : smooth(p);
      page.style.transformOrigin = `${cx}px ${cy}px`;
      page.style.transform = `translate(${(innerWidth / 2 - cx) * e}px, ${(innerHeight / 2 - cy) * e}px) scale(${1 + (scale - 1) * e})`;
      page.style.opacity = p > 0.97 ? '0' : '1';
      for (const element of page.querySelectorAll<HTMLElement>('[data-fades]'))
        element.style.opacity = String(1 - clamp01(p / 0.35));
      if (invite.current) invite.current.style.opacity = scrollY > 8 ? '0' : '1';

      const middle = innerHeight / 2;
      let found: SceneName = 'hero';
      let share = 0;
      for (const section of document.querySelectorAll<HTMLElement>('[data-scene]')) {
        const box = section.getBoundingClientRect();
        if (box.top <= middle && box.bottom > middle) {
          found = section.dataset.scene as SceneName;
          share = clamp01((middle - box.top) / box.height);
        }
      }
      if (
        found === 'hero' &&
        (document.getElementById(BUREAU_ID)?.getBoundingClientRect().top ?? Infinity) < middle
      )
        found = 'bureau';
      reading.current.scene = found;
      reading.current.progress = share;
      reading.current.focus =
        found === 'hero'
          ? [cx + (innerWidth / 2 - cx) * e, cy + (innerHeight / 2 - cy) * e]
          : focusOf(found);
      setScene(found);
      if (found === 'race' || found === 'night') setProgress(Math.round(share * 200) / 200);
    };
    const remeasure = () => {
      measure();
      update();
    };
    remeasure();
    void document.fonts.ready.then(remeasure);
    addEventListener('scroll', update, { passive: true });
    addEventListener('resize', remeasure);
    return () => {
      removeEventListener('scroll', update);
      removeEventListener('resize', remeasure);
    };
  }, [still]);

  useEffect(() => {
    let alive = true;
    let made: LandingTable | null = null;
    void (async () => {
      const [{ LandingTable }, sheet] = await Promise.all([
        import('./table/table'),
        fetch('/europe-sheet.json').then((response) => response.json()),
        ...ENGRAVING_FONTS.map((font) => document.fonts.load(font).catch(() => undefined)),
      ]);
      if (!alive || canvas.current === null) return;
      try {
        made = new LandingTable(canvas.current, sheet, motion, reading.current, setStory);
        setTable(made);
        setEngraved(true);
      } catch (error) {
        // Without WebGL the page still reads: the clippings carry the text, the photo the desk.
        console.error('landing table', error);
        setEngraved(true);
      }
    })().catch((error: unknown) => {
      console.error('landing table', error);
      setEngraved(true);
    });
    return () => {
      alive = false;
      made?.dispose();
    };
  }, [motion]);

  const playing = scene === 'front' || scene === 'fog' || scene === 'battle';
  const today = new Date();

  return (
    <div className={`lp${playing ? ' lp-playing' : ''}`} data-still={still ? '' : undefined}>
      <canvas ref={canvas} className="lp-canvas" aria-hidden />
      <div className="lp-vignette" aria-hidden />
      <Board
        table={table}
        story={story}
        scene={scene}
        progress={progress}
        age={age}
        still={still}
      />

      <main>
        <div className="lp-une-wrap">
          <header className="lp-une" aria-label={fr.front.headline}>
            <div ref={front} className="lp-front">
              <div className="lp-page">
                <div className="lp-masthead" data-fades>
                  <div className="lp-masthead-rules" aria-hidden />
                  <h1 className="lp-wordmark">
                    <Wordmark size="clamp(40px, 9.4vw, 124px)" />
                  </h1>
                  <div className="lp-dateline">
                    <span>
                      {fr.front.dateline}
                      <span className="lp-long">{fr.front.datelineLong}</span>
                    </span>
                    <span className="lp-long">{fr.front.date(today)}</span>
                    <span>{fr.front.onInvitation}</span>
                  </div>
                </div>

                <div className="lp-body">
                  <div className="lp-photo-col">
                    <div ref={photo} className="lp-photo">
                      <div className="lp-engraving" style={{ opacity: engraved ? 0 : 1 }}>
                        {fr.front.engraving}
                      </div>
                      <div ref={invite} className="lp-invite" aria-hidden>
                        {fr.front.unfold}
                        <svg viewBox="0 0 18 34">
                          <path d="M9 2c-1.5 6 1.5 12 0 18s.5 7 0 9" />
                          <path d="M3 24c2.5 2 4.5 4.5 6 8 1.5-3.5 3.5-6 6-8" />
                          <circle cx="9" cy="2" r="1.4" fill="currentColor" stroke="none" />
                        </svg>
                      </div>
                      <span data-fades className="lp-film">
                        <FilmTrailer plate />
                      </span>
                    </div>
                    <p className="lp-caption" data-fades>
                      {fr.front.caption}
                    </p>
                  </div>

                  <div className="lp-lead" data-fades>
                    <h2>{fr.front.headline}</h2>
                    <p className="lp-chapo">{fr.front.lede}</p>
                    <div className="lp-editions">
                      {fr.front.editions.map((edition) => (
                        <article key={edition.name}>
                          <span className="lp-k">{edition.kicker}</span>
                          <b>{edition.name}</b>
                          <span className="lp-m">{edition.meta}</span>
                          <span className="lp-p">{edition.text}</span>
                        </article>
                      ))}
                    </div>
                    <div className="lp-encadre">
                      <div>
                        <span className="lp-encadre-stamp">
                          <Stamp label={fr.front.onInvitation} tone="critical" />
                        </span>
                        <div className="lp-row2">
                          <a
                            className="lp-btn lp-btn--solid"
                            href={`#${BUREAU_ID}`}
                            onClick={(event) => {
                              event.preventDefault();
                              clearTimeout(focusing.current);
                              focusing.current = focusCode(still);
                            }}
                          >
                            {fr.front.haveCode}
                          </a>
                          <Link className="lp-btn" to="/connexion">
                            {fr.front.signIn}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="lp-briefs" data-fades>
                  {fr.front.briefs.map((brief) => (
                    <section key={brief.kicker}>
                      <h3>{brief.kicker}</h3>
                      <p>
                        {brief.text} <b>{brief.page}</b>
                      </p>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          </header>
        </div>

        <Clippings
          table={table}
          story={story}
          progress={progress}
          scene={scene}
          age={age}
          onAge={setAge}
          still={still}
        />
        <Bureau />
      </main>
      <footer className="lp-footer">
        {fr.front.footer} · {fr.front.staged} · <Link to="/credits">{fr.front.credits}</Link>
      </footer>
    </div>
  );
}

const ENGRAVING_FONTS = [
  '700 20px "Bodoni Moda"',
  'italic 500 20px "Bodoni Moda"',
  '600 20px "Archivo Narrow"',
  '400 20px "IBM Plex Mono"',
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** Where the camera's aim sits on screen: right of the clipping at the desk, above it on a phone. */
function focusOf(scene: SceneName): readonly [number, number] {
  const w = innerWidth;
  const h = innerHeight;
  if (scene === 'bureau') return [w / 2, h / 2];
  if (w <= 760) return [w / 2, h * (scene === 'battle' || scene === 'fog' ? 0.4 : 0.3)];
  if (scene === 'press') return [w * 0.62, h * 0.7];
  if (scene === 'race') return [w * 0.67, h * 0.5];
  return [w * 0.66, h * 0.55];
}
