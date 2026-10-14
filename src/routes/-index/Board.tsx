import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CompassAction, Compass } from '@/domain/compass-rose';
import { asDuration } from '@/domain/duration';
import { NIGHT_CITIES, RACE_POINTS, raceAt, type RacePoint } from '@/domain/landing';
import type { Poster } from '@/domain/map-poster';
import type { MovementAim } from '@/domain/movement-orders';
import { INK_BY_NATION } from '@/domain/nations';
import { RESOURCES } from '@/domain/ids';
import { FlagWatermark } from '@/emblems/Flag';
import { fr, nationLabel } from '@/i18n/fr';
import { CompassRose } from '@/map/CompassRose';
import { AbacusMark } from '@/routes/-plateau/GunneryButton';
import { MapPoster } from '@/routes/-plateau/MapPoster';
import { useClock } from '@/shell/clock';
import { PressGlyph, TelegraphGlyph } from '@/shell/Glyph';
import { IndustryGlyph, Pictogram } from '@/shell/IndicatorGlyph';
import { ARC, ARC_INNER, ARC_OUTER, LABEL, ROUND, roundAt } from '@/shell/Protractor';
import { FundsCell, SlotBoxes } from '@/shell/Reglette';
import { SQUARE } from '@/shell/SurfaceColumn';
import { buildCost, buildMinutes } from '../../../convex/constants';
import type { LandingTable, SceneName, Story } from './table/table';

const pieces = fr.front.pieces;
const WAITING = 2;
const SLOTS = 2;
const FUNDS = 297;

/**
 * **Le cadre du plateau, joué** : la réglette, la colonne des surfaces et le rapporteur du vrai
 * plateau, sur les seules pages où l'on joue, et ce que la table tient au-dessus de ses pièces —
 * les affiches (`MapPoster`), la rose (`CompassRose`), la carte d'envoi. Le contenu est inventé ;
 * les pièces d'interface sont celles du jeu.
 */
export function Board({
  table,
  story,
  scene,
  progress,
  age,
  still,
}: {
  table: LandingTable | null;
  story: Story | null;
  scene: SceneName;
  progress: number;
  age: number;
  still: boolean;
}) {
  const playing = scene === 'front' || scene === 'fog' || scene === 'battle';
  const front = story?.front ?? null;
  const battle = story?.battle ?? null;
  const [loadedAt] = useState(() => Date.now());
  const now = useClock();

  return (
    <>
      <div className="lp-pins">
        <Pin table={table} name="pile">
          <MapPoster poster={PILE} />
        </Pin>
        <Pin table={table} name="post">
          <MapPoster poster={POST} />
        </Pin>
        <Pin table={table} name="survey">
          <MapPoster poster={survey(age)} />
        </Pin>
        <Pin table={table} name="foe">
          <MapPoster poster={FOE} />
        </Pin>
        <Pin table={table} name="town">
          <MapPoster poster={town(battle?.taken ?? false)} />
        </Pin>
        <Pin table={table} name="capture">
          <MapPoster poster={capture(battle?.capture ?? 0)} />
        </Pin>
        <Pin table={table} name="send">
          {front?.confirm != null && (
            <SendCard
              order={front.confirm}
              place={front.place}
              km={front.km}
              arrival={front.minutes}
              onSend={() => table?.send()}
            />
          )}
        </Pin>
        <RacePins table={table} progress={scene === 'race' ? progress : 0} />
        {(Object.keys(NIGHT_CITIES) as (keyof typeof NIGHT_CITIES)[]).map((city) => (
          <Pin key={city} table={table} name={`city:${city}`}>
            <span className="lp-city">{fr.front.cities[city]}</span>
          </Pin>
        ))}
      </div>

      <div className="lp-rose-layer">
        {front?.rose != null && (
          <CompassRose
            key={front.rose.join()}
            compass={frontRose(front.place)}
            x={front.rose[0]}
            y={front.rose[1]}
            width={innerWidth}
            height={innerHeight}
            shown={0}
            onClose={() => table?.dismiss()}
            onAction={(action: CompassAction) =>
              table?.choose(action.key === 'found' ? 'found' : 'march')
            }
          />
        )}
        {battle?.order != null && (
          <CompassRose
            compass={ASSAULT_ROSE}
            x={battle.order[0]}
            y={battle.order[1]}
            width={innerWidth}
            height={innerHeight}
            shown={0}
            onClose={noop}
            onAction={noop}
          />
        )}
      </div>

      <header
        className="lp-board lp-reglette hud paper-grain float"
        data-off={playing ? undefined : ''}
        aria-hidden
      >
        <div className="lp-reglette-cell lp-reglette-nation">
          <FlagWatermark nation="france" opacity={0.85} onPaper />
          <div className="relative">
            <span className="lp-reglette-brand">
              {fr.masthead.article} {fr.masthead.word}
              <b>{fr.rail.seasonShort(3)}</b>
            </span>
            <span className="lp-reglette-name">{nationLabel('france')}</span>
          </div>
        </div>
        <div className="lp-reglette-cell">
          <span className="lp-label">{fr.resourceBand.slots}</span>
          <SlotBoxes used={front?.sent ? 1 : 0} total={SLOTS} />
          <span className="lp-num lp-reglette-count text-[13px]">
            {fr.banner.slotsCount(front?.sent ? 1 : 0, SLOTS)}
          </span>
        </div>
        {scene === 'battle' && (
          <div className="lp-reglette-cell lp-reglette-funds">
            <FundsCell
              funds={{ stock: FUNDS, perMinute: battle?.taken ? 60 : 45 }}
              loadedAt={loadedAt}
              now={now}
            />
          </div>
        )}
      </header>

      <nav className="lp-board lp-column hud" data-off={playing ? undefined : ''} aria-hidden>
        <span className={`${SQUARE} lp-todo`}>
          <b>{WAITING}</b>
          <span className={SQUARE_LABEL}>{fr.rail.todo}</span>
        </span>
        <Square
          label={fr.rail.nation.label}
          icon={<Pictogram pictogram="nation" weight={20} size={18} />}
        />
        <Square label={fr.rail.gunnery.label} icon={<AbacusMark size={17} />} />
        <Square
          label={fr.rail.journal.label}
          icon={<Pictogram pictogram="journal" weight={20} size={18} />}
          badge={battle?.taken ? 1 : 0}
        />
        <Square label={fr.rail.press.label} icon={<PressGlyph size={18} />} />
        <Square label={fr.rail.telegraph.label} icon={<TelegraphGlyph size={18} />} />
      </nav>

      <DemoProtractor playing={playing} still={still} />
    </>
  );
}

const noop = () => undefined;
const SQUARE_LABEL = 'text-[7.5px] leading-none font-semibold tracking-[.1em] uppercase';

function Square({ label, icon, badge = 0 }: { label: string; icon: ReactNode; badge?: number }) {
  return (
    <span className={SQUARE}>
      {icon}
      <span className={SQUARE_LABEL}>{label}</span>
      <span className="lp-badge" data-on={badge > 0 ? '' : undefined}>
        {badge}
      </span>
    </span>
  );
}

/** A DOM node the table moves over its anchor at every image (`LandingTable.pin`). */
function Pin({
  table,
  name,
  children,
}: {
  table: LandingTable | null;
  name: string;
  children: ReactNode;
}) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (table === null || element === null) return;
    table.pin(name, element);
    return () => table.pin(name, null);
  }, [table, name, element]);
  return (
    <div ref={setElement} className="lp-pin map-poster-anchor">
      {children}
    </div>
  );
}

function RacePins({ table, progress }: { table: LandingTable | null; progress: number }) {
  const { holders } = raceAt(progress);
  const [open, setOpen] = useState<RacePoint | null>(null);
  return (
    <>
      {(Object.keys(RACE_POINTS) as RacePoint[]).map((point) => {
        const holder = holders[point];
        const [name, rule] = fr.front.pages.race.sites[point];
        return (
          <Pin key={point} table={table} name={`race:${point}`}>
            <button
              type="button"
              className="lp-seven"
              data-open={open === point ? '' : undefined}
              aria-expanded={open === point}
              style={
                holder === undefined ? undefined : { ['--hold' as string]: INK_BY_NATION[holder] }
              }
              onPointerEnter={(event) => event.pointerType === 'mouse' && setOpen(point)}
              onPointerLeave={(event) => event.pointerType === 'mouse' && setOpen(null)}
              onClick={() => setOpen((shown) => (shown === point ? null : point))}
              onBlur={() => setOpen(null)}
            >
              <b>{name}</b>
              <span>{rule}</span>
            </button>
          </Pin>
        );
      })}
    </>
  );
}

/** The phone's protractor, played: the game's arc and rounds, opening and closing, and no more. */
function DemoProtractor({ playing, still }: { playing: boolean; still: boolean }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!playing) close();
  }, [playing, close]);
  const rounds: ReadonlyArray<readonly [string, ReactNode]> = [
    [
      fr.foot.todo,
      <b key="todo" className="font-(family-name:--font-display) text-[18px]">
        {WAITING}
      </b>,
    ],
    [fr.foot.works, <IndustryGlyph key="works" size={18} />],
    [fr.foot.journal, <Pictogram key="journal" pictogram="journal" weight={40} size={18} />],
    [fr.foot.press, <PressGlyph key="press" size={18} />],
    [fr.rail.telegraph.label, <TelegraphGlyph key="telegraph" size={18} />],
  ];
  return (
    <div className="lp-board lp-protractor" data-off={playing ? undefined : ''}>
      <nav
        aria-label={fr.protractor.label}
        data-open={open ? '' : undefined}
        data-motion={still ? 'reduced' : 'full'}
        className="hud protractor text-[var(--ink)]"
        style={{ position: 'fixed', right: 0, bottom: 0 }}
      >
        <span
          aria-hidden
          className="protractor-arc border border-(color:--ink)/70"
          style={ARC(ARC_OUTER)}
        />
        <span
          aria-hidden
          className="protractor-arc border border-dashed border-(color:--ink)/45"
          style={ARC(ARC_INNER)}
        />
        <ul inert={!open} aria-hidden={!open}>
          {rounds.map(([label, icon], rank) => (
            <li key={label}>
              <span
                className={`${ROUND} ${rank === 0 ? 'bg-[var(--ink)] text-[var(--paper)]' : 'paper-grain'}`}
                style={roundAt(rank, rounds.length)}
              >
                {icon}
                <span className={LABEL}>{label}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? fr.protractor.close : fr.protractor.open(WAITING)}
          onClick={() => setOpen((shown) => !shown)}
          className="protractor-hub float flex cursor-pointer flex-col items-center justify-center gap-[3px] bg-[var(--ink)] text-[var(--paper)]"
        >
          <span aria-hidden className="flex flex-col items-center gap-[3px]">
            <span className="font-(family-name:--font-display) text-[24px] leading-none font-bold">
              {open ? '×' : WAITING}
            </span>
            <span className={LABEL}>{open ? fr.protractor.closeShort : fr.foot.todo}</span>
          </span>
        </button>
      </nav>
    </div>
  );
}

/** « Envoyer — irréversible », au point posé : la route et l'heure qu'en jeu le serveur daterait. */
function SendCard({
  order,
  place,
  km,
  arrival,
  onSend,
}: {
  order: 'march' | 'found';
  place: string | null;
  km: number;
  arrival: number;
  onSend: () => void;
}) {
  const hour = `${String(Math.floor(arrival / 60) % 24).padStart(2, '0')}:${String(arrival % 60).padStart(2, '0')}`;
  return (
    <div className="lp-send">
      <div className="rose-bubble">
        <div className="rose-bubble-frame">
          <div className="rose-bubble-header">
            <span>{order === 'march' ? fr.movementTypes.march : fr.compass.found}</span>
            <span>{fr.front.sheet.km(km)}</span>
          </div>
          <div className="rose-bubble-name">
            {fr.front.send.toward(place ?? fr.front.send.here)}
          </div>
          <div className="rose-bubble-rule" />
          <div className="rose-bubble-label">{fr.front.send.arrival(hour)}</div>
          <div className="rose-bubble-cost">{fr.front.send.slots}</div>
          {order === 'found' && (
            <div className="rose-bubble-cost rose-bubble-cost--held">
              {asDuration(buildMinutes('outpost', 1))}
            </div>
          )}
          <button type="button" className="lp-send-button" onClick={onSend}>
            {fr.aim.submit}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The rose is played, never sent: its aim only has to be well formed. */
const VERDUN = [5.38, 49.16] as const;
const AIM: MovementAim = {
  kind: 'region',
  regionId: 'FRA-verdun',
  country: 'FRA',
  lon: VERDUN[0],
  lat: VERDUN[1],
  surveyed: true,
};

function frontRose(place: string | null): Compass {
  const cost = buildCost('outpost', 1);
  const due = RESOURCES.filter((resource) => (cost[resource] ?? 0) > 0);
  return {
    kicker: fr.compass.region(nationLabel('france')),
    name: place ?? fr.front.send.here,
    refusal: null,
    actions: [
      {
        key: 'aim',
        pictogram: 'cabin',
        label: fr.movementTypes.march,
        cost: fr.compass.slotsCost(SLOTS),
        consequence: fr.compass.marchConsequence(fr.movementTypes.march),
        aim: AIM,
        type: 'march',
      },
      {
        key: 'found',
        pictogram: 'post',
        label: fr.compass.found,
        cost: null,
        consequence: fr.compass.foundConsequence,
        point: VERDUN,
        regionId: null,
        troopIds: [],
        figure: due.map((resource) => String(cost[resource])).join(' · '),
        bill: due.map((resource) => ({
          text: `${fr.resources[resource]} ${cost[resource]}`,
          lacking: false,
        })),
        duration: asDuration(buildMinutes('outpost', 1)),
      },
    ],
  };
}

const ASSAULT_ROSE: Compass = {
  kicker: pieces.enemyForce,
  name: pieces.forceInField,
  refusal: null,
  actions: [
    {
      key: 'aim',
      pictogram: 'rifles',
      label: fr.movementTypes.attack,
      cost: fr.aim.initiative,
      consequence: fr.aim.cover.open(),
      aim: AIM,
      type: 'attack',
    },
  ],
};

const plain = { washed: false, lines: [], bar: null, loading: null, pile: null } as const;

const PILE: Poster = {
  ...plain,
  eyebrow: pieces.pile,
  title: pieces.infantry,
  pile: {
    lines: [{ role: 'infantry', troops: 3, troopIds: [], health: 100, notches: 10, ink: 'ink' }],
    cargo: [],
  },
};

const POST: Poster = {
  ...plain,
  eyebrow: pieces.post,
  title: pieces.postLevel,
  lines: [
    { kind: 'row', label: pieces.reach, value: pieces.reachKm },
    { kind: 'chip', label: fr.posters.network, chip: fr.posters.linked, tone: 'ok' },
  ],
};

const survey = (hours: number): Poster => ({
  ...plain,
  washed: true,
  eyebrow: pieces.surveyedAgo(fr.front.pages.fog.time, hours),
  title: fr.posters.moving,
  lines: [
    { kind: 'text', text: fr.posters.unknown },
    { kind: 'row', label: pieces.estimatedHeading, value: pieces.southWest },
  ],
});

const FOE: Poster = {
  ...plain,
  eyebrow: pieces.atContact(fr.front.pages.battle.time),
  title: nationLabel('germany'),
  lines: [
    { kind: 'row', label: pieces.infantryOne, value: pieces.men(50) },
    { kind: 'row', label: pieces.armorOne, value: pieces.panzer },
    { kind: 'chip', label: pieces.openField, chip: pieces.unsheltered, tone: 'cut' },
  ],
};

const town = (mine: boolean): Poster =>
  mine
    ? {
        ...plain,
        eyebrow: pieces.townMine,
        title: pieces.berne,
        lines: [
          { kind: 'row', label: fr.blitz.funds, value: fr.blitz.perMinute(15) },
          { kind: 'chip', label: fr.posters.network, chip: fr.posters.linked, tone: 'ok' },
        ],
      }
    : {
        ...plain,
        eyebrow: fr.blitz.neutral,
        title: `${pieces.berne} · ${pieces.town}`,
        lines: [
          { kind: 'row', label: fr.blitz.funds, value: fr.blitz.perMinute(15) },
          { kind: 'text', text: fr.blitz.unguarded },
        ],
      };

const capture = (share: number): Poster => ({
  ...plain,
  eyebrow: pieces.capture,
  title: share < 1 ? pieces.capturing : pieces.taken,
  lines: [
    { kind: 'row', label: pieces.forces, value: pieces.forcesValue },
    {
      kind: 'row',
      label: fr.posters.left,
      value: share < 1 ? asDuration((1 - share) * 42) : '—',
    },
  ],
  bar: share,
});
