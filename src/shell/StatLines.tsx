import { useState, type ReactNode } from 'react';
import { MAX_HQ_LEVEL } from '../../convex/constants';
import { asSpan } from '@/domain/duration';
import { shareOfReading, type StatKey, type StatReading, type StatRow } from '@/domain/stat-sheet';
import { fr, roleLabel } from '@/i18n/fr';
import { SolidGlyph } from './Glyph';
import { Price } from './Price';

/**
 * **Le bloc de statistiques** (#191, variante B « réglette ») : une ligne par statistique, avec
 * son picto, son nom, une réglette graduée sur toutes les pièces du jeu et sa valeur. Le repère
 * place la pièce entre la pire et la meilleure. **Une valeur sans échelle** — « au contact »,
 * « marche », « ne tire pas » — s'écrit en toutes lettres : une réglette posée sur un zéro ne
 * veut rien dire. Il sert à la fiche au survol, à la feuille d'un site et à l'abaque.
 */
type Rubric = keyof typeof fr.stats.rubrics;

const RUBRIC_OF: Readonly<Record<StatKey, Rubric>> = {
  pace: 'move',
  fuel: 'move',
  detection: 'move',
  strength: 'fight',
  rounds: 'fight',
  reach: 'fight',
  reload: 'fight',
  seats: 'carry',
  boarding: 'carry',
  load: 'carry',
  loot: 'carry',
  upkeep: 'carry',
  cost: 'form',
  training: 'form',
  levelGain: 'site',
  production: 'site',
  storage: 'site',
  listening: 'site',
  consumption: 'site',
  protection: 'site',
  capture: 'site',
  garrison: 'site',
  forms: 'site',
  raise: 'site',
};

/** Les silhouettes pleines, 24 × 24, de la famille de `Glyph.tsx`. */
const PATH_OF: Readonly<Record<StatKey, string>> = {
  pace: 'M2 5h4.5l7 7-7 7H2l7-7zm8.5 0H15l7 7-7 7h-4.5l7-7z',
  detection:
    'M2 12C5.1 6.2 8.5 4.5 12 4.5S18.9 6.2 22 12c-3.1 5.8-6.5 7.5-10 7.5S5.1 17.8 2 12zm10-4a4 4 0 1 0 0 8 4 4 0 1 0 0-8zm0 2.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 1 1 0-3.4z',
  strength: 'M12 20.6L4.4 12A5 5 0 0 1 12 6.4 5 5 0 0 1 19.6 12z',
  cost: 'M12 4.4a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 1 0 0-15.2z',
  training: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zm-.9 2.8h1.8v5.4h4.2v1.7h-6z',
  levelGain: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zm-.9 2.8h1.8v5.4h4.2v1.7h-6z',
  rounds: 'M9 22V10.5C9 7 10.4 4 12 2c1.6 2 3 5 3 8.5V22zM8 22h8v-2H8z',
  fuel: 'M6 5h4V3h4v2h4v17H6zm2.6 4.2 6.8 9.6 1.2-.9-6.8-9.6zm6.8 0-6.8 9.6 1.2.9 6.8-9.6z',
  reach:
    'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 3a7 7 0 1 1 0 14 7 7 0 1 1 0-14zm0 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z',
  reload: 'M6 2h12v2.5l-4.6 7.5 4.6 7.5V22H6v-2.5l4.6-7.5L6 4.5z',
  seats: 'M6 3h4v9h8v9h-3v-6H6z',
  boarding: 'M6 3h4v9h8v9h-3v-6H6z',
  load: 'M3 7l9-4 9 4v10l-9 4-9-4zm2 1.6v7.1l6 2.7v-7.1zm14 0-6 2.7v7.1l6-2.7z',
  loot: 'M9 3h6l-2 3c4 1 7 5 7 9 0 4-3 6-8 6s-8-2-8-6c0-4 3-8 7-9z',
  garrison: 'M4 21V9h3V6h2v3h2V6h2v3h2V6h2v3h3v12h-6v-5h-4v5z',
  forms: 'M3 21V10l9-6 9 6v11h-6v-6H9v6z',
  raise: 'M12 3l8 8h-5v4H9v-4H4zM4 18h16v3H4z',
  capture: 'M5 2h2v20H5zm3 1h11l-3 4 3 4H8z',
  protection: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
  listening:
    'M11 10h2v12h-2zM12 2a8 8 0 0 1 8 8h-2a6 6 0 0 0-12 0H4a8 8 0 0 1 8-8zm0 4a4 4 0 0 1 4 4h-2a2 2 0 0 0-4 0H8a4 4 0 0 1 4-4z',
  production: 'M3 4h18v3H3zm2 5h14v11H5zm3 3v2h8v-2z',
  storage: 'M3 4h18v3H3zm2 5h14v11H5zm3 3v2h8v-2z',
  consumption: 'M3 4h18v3H3zm2 5h14v11H5zm3 3v2h8v-2z',
  upkeep: 'M4 10c0-3 3.6-5 8-5s8 2 8 5v2H4zm0 4h16v5H4z',
};

/** Le dessin de la statistique : il porte son nom pour le lecteur d'écran. */
export function StatGlyph({ stat, size = 15 }: { stat: StatKey; size?: number }) {
  return (
    <SolidGlyph size={size} label={fr.stats.names[stat]}>
      <path fillRule="evenodd" d={PATH_OF[stat]} />
    </SolidGlyph>
  );
}

const duration = (value: number): string => asSpan(value);

/** Ce que la valeur imprime, selon la statistique : c'est ici que se choisit l'unité. */
export function statValue(key: StatKey, reading: StatReading, short = false): ReactNode {
  switch (reading.kind) {
    case 'word': {
      const word = fr.stats.words[reading.word];
      return typeof word === 'function' ? word(short ? undefined : reading.km) : word;
    }
    case 'roles':
      return reading.roles.map((role) => roleLabel(role, 1)).join(', ');
    case 'price':
      return <Price costs={reading.costs} size={13} />;
    case 'funds':
      return fr.blitz.price(reading.amount);
    case 'raise':
      return (
        <span className="inline-flex flex-wrap items-center justify-end gap-x-[8px]">
          <Price costs={reading.costs} size={13} />
          <span>{duration(reading.minutes)}</span>
        </span>
      );
    case 'figure':
      switch (key) {
        case 'listening':
          return fr.stats.km(reading.value);
        case 'consumption':
          return fr.stats.coalPerHour(reading.value);
        case 'protection':
          return fr.stats.percent(reading.value);
        case 'capture':
          return duration(reading.value);
        case 'upkeep':
          return fr.stats.foodPerHour(reading.value);
        default:
          return fr.stats.count(reading.value);
      }
    case 'scaled': {
      const { value, of, floor } = reading;
      switch (key) {
        case 'pace':
        case 'training':
          return duration(value);
        case 'reload':
          return duration(value / 60);
        case 'detection':
          return fr.stats.km(value);
        case 'reach':
          return floor === undefined ? fr.stats.km(value) : fr.stats.range(floor, value);
        case 'fuel':
          return fr.stats.crans(value, of);
        case 'rounds':
          return fr.stats.passes(value, of);
        case 'seats':
        case 'boarding':
          return fr.stats.places(value, of);
        case 'levelGain':
          return fr.stats.gainOfLevel(value);
        case 'production':
          return fr.stats.perHour(fr.stats.count(value), reading.resource);
        default:
          return of === undefined ? fr.stats.count(value) : fr.stats.of(value, of);
      }
    }
  }
}

/** La réglette : dix graduations, une barre jusqu'à la part, un repère à son bout. */
function Ruler({ share }: { share: number | null }) {
  if (share === null) return <span aria-hidden />;
  return (
    <span
      aria-hidden
      className="relative h-[9px] border-b border-(color:--ink)/45"
      style={{
        backgroundImage:
          'repeating-linear-gradient(90deg, color-mix(in srgb, var(--ink) 38%, transparent) 0 1px, transparent 1px 10%)',
      }}
    >
      <i
        className="absolute bottom-0 left-0 h-[4px] bg-[var(--ink)]"
        style={{ width: `${share * 100}%` }}
      />
      <b
        className="absolute -bottom-[2px] ml-[-1.5px] h-[12px] w-[3px] bg-[var(--arc-mine)] shadow-[0_0_0_1px_var(--ink)]"
        style={{ left: `${share * 100}%` }}
      />
    </span>
  );
}

/** **Une ligne se déplie au toucher ou au clic** pour dire ce que la statistique veut dire : un
 *  `title` ne s'affiche pas au doigt, et la note reste dans le bloc, sous sa ligne. */
function Line({ row }: { row: StatRow }) {
  const [open, setOpen] = useState(false);
  const share = shareOfReading(row.reading);
  const name = fr.stats.names[row.key];
  return (
    <div data-stat={row.key} className="border-b border-(color:--ink)/18 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid w-full cursor-pointer grid-cols-[17px_72px_minmax(0,1fr)_auto] items-center gap-x-[7px] py-[3px] text-left max-md:grid-cols-[17px_84px_minmax(0,1fr)_auto]"
      >
        <StatGlyph stat={row.key} />
        <span className="text-[12.5px] leading-[1.1] first-letter:uppercase">{name}</span>
        <Ruler share={share} />
        <span
          className={`text-right ${
            share === null
              ? 'text-[12.5px] leading-[1.2] text-[var(--ink-note)] first-letter:uppercase'
              : 'font-(family-name:--font-mono) text-[13px] leading-none font-semibold whitespace-nowrap'
          }`}
        >
          {statValue(row.key, row.reading)}
        </span>
      </button>
      {open && (
        <p className="pb-[5px] pl-[24px] text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
          {fr.stats.notes[row.key]}
        </p>
      )}
    </div>
  );
}

/** Les lignes, rangées sous leur rubrique quand il y en a plusieurs (`grouped`). */
export function StatLines({
  rows,
  grouped = true,
  scale = 'pieces',
}: {
  rows: ReadonlyArray<StatRow>;
  grouped?: boolean;
  /** Ce que la réglette gradue : toutes les pièces du jeu, ou les niveaux d'un bâtiment. */
  scale?: 'pieces' | 'levels';
}) {
  const rubrics = grouped
    ? (Object.keys(fr.stats.rubrics) as Rubric[]).filter((rubric) =>
        rows.some((row) => RUBRIC_OF[row.key] === rubric),
      )
    : [null];
  const scaled = rows.some((row) => shareOfReading(row.reading) !== null);
  return (
    <div className="grid gap-px" data-testid="stat-lines">
      {scaled && (
        <div className="flex justify-between pl-[96px] text-[8.5px] tracking-[.1em] whitespace-nowrap text-[var(--ink-soft)] uppercase">
          <span>{fr.stats.scaleKey.low}</span>
          <span className="max-md:hidden">
            {scale === 'levels' ? fr.stats.scaleKey.levels(MAX_HQ_LEVEL) : fr.stats.scaleKey.range}
          </span>
          <span>{fr.stats.scaleKey.high}</span>
        </div>
      )}
      {rubrics.map((rubric) => (
        <div key={rubric ?? 'all'}>
          {rubric !== null && rubrics.length > 1 && (
            <h4 className="mt-[6px] mb-[2px] text-[9px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
              {fr.stats.rubrics[rubric]}
            </h4>
          )}
          {rows
            .filter((row) => rubric === null || RUBRIC_OF[row.key] === rubric)
            .map((row) => (
              <Line key={row.key} row={row} />
            ))}
        </div>
      ))}
    </div>
  );
}
