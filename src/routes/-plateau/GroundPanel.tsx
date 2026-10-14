import { useEffect, useState, type ReactNode } from 'react';
import { countryLabel, fr, nationLabel } from '@/i18n/fr';
import { asClockTime, asPressDate } from '@/domain/duration';
import { NATION_BY_ADM0 } from '@/domain/nations';
import type { PlayerView } from '@/domain/player-view';
import { depositOfRegion, loadCoastalRegions, type HoveredRegion } from '@/domain/world';
import { useNarrowScreen } from '@/shell/viewport';
import { Panel } from './Panel';

/**
 * **Ce que le joueur sait du tenant d'une région**, servi par `control.held` et jamais recalculé
 * ici — c'est la réponse même que la carte peint, donc les deux ne peuvent pas se contredire.
 * Une région vierge n'en a pas de ligne : `null`, et rien ne s'affiche (ADR 0020 §5).
 */
export type RegionHolding = {
  /** Le siège qui tient, tel que la revendication le nomme. `null` est un siège sans nation —
   *  impossible en saison lancée, et `nationLabel` le dit plutôt que de le taire. */
  readonly nation: string | null;
} & ({ readonly state: 'current' } | { readonly state: 'surveyed'; readonly seenAt: number });

/**
 * **What the board is looking at, on one card.** The country and the region used to answer in
 * two stacked boxes, and they were reading the same gesture: the pointer lands on a region, the
 * region belongs to a country, and the player was made to assemble the two himself.
 *
 * **The pointer wins, the selection is what it falls back to.** Hovering shows what is under
 * the pointer and leaving it gives the selected country back. A card that kept a selected
 * France in its head while naming a Romanian region under it would be worse than either box
 * was alone.
 *
 * **The country answers at every zoom, the region only close in.** The region layer fades in
 * under 65 units and the card must not go dark above that: the two hovers are two announcements
 * and the country's is the one that is always there. The region section is shown only when it
 * belongs to the country in the head — the two arrive by different roads, and a card is not the
 * place to discover they disagree.
 *
 * **La géologie répond partout, le relevé non** (décision 65a du 01/09). Le gisement et la côte
 * se lisent sur l'asset : ils sont fixes, identiques pour tout le monde, et ne disent rien de ce
 * qu'un joueur fait — une région roumaine survolée dit son pétrole sans qu'on possède rien.
 * « Tenue par », elle, reste du brouillard : elle vient de `control.held`, elle date, et une
 * région vierge n'en a pas de ligne (ADR 0020 §5).
 *
 * **`holding` est ce que le joueur sait du sol survolé** (ADR 0020 §5) : à jour, le nom franc ;
 * relevé, le nom et sa date en clair. Vierge, il est `null` et la ligne ne paraît pas — inconnue
 * n'est pas neutre.
 *
 * **Deux questions, deux lignes, et c'est le correctif du 31/08** : « avant-poste » dit ce que ce
 * *pays* porte, « tenue par » dit qui tient la *région* sous le curseur. Une seule ligne pour les
 * deux répondait « avant-poste : aucun » sur un sol que la carte peignait depuis un point planté
 * chez le voisin — deux surfaces qui se contredisent sur la même donnée.
 */
export function GroundPanel({
  selected,
  hoveredCountry,
  hoveredRegion,
  holding,
  suspendedUntil,
  view,
  onDeselect,
}: {
  selected: string | null;
  hoveredCountry: string | null;
  hoveredRegion: HoveredRegion | null;
  holding: RegionHolding | null;
  /**
   * **L'heure où sa zone hors service redevient la sienne** (ADR 0020 §7), `null` partout
   * ailleurs. À part de `holding` et jamais fondue dedans : la région n'est *pas* tenue — une
   * région disputée peut même être au voisin pendant ce temps — et les deux lignes se lisent
   * ensemble sans qu'aucune ait à mentir. Le serveur ne la sert qu'au propriétaire (ADR 0005).
   */
  suspendedUntil: number | null;
  view: PlayerView;
  /** Sous le seuil le panneau est une feuille, et « fermer » y défait la sélection qui l'a ouvert. */
  onDeselect: () => void;
}) {
  const coastal = useCoastalRegions();
  const narrow = useNarrowScreen();
  const country = hoveredRegion?.country ?? hoveredCountry ?? selected;
  if (country === null) return null;
  const hovered = hoveredRegion?.country === country ? hoveredRegion : null;

  const outpost = view.me.outposts.find((candidate) => candidate.hostCountry === country);
  const deposit = hovered === null ? null : depositOfRegion(hovered.id);
  // The map designates a country by its `adm0_a3`, opponents by their nation id: the mapping
  // is the seam — comparing the two raw strings never matches (that was a real bug).
  const nation = NATION_BY_ADM0.get(country);
  const opponent =
    nation === undefined ? undefined : view.opponents.find((other) => other.nation === nation);
  /** **Son propre sol répond de lui-même** (trouvaille du 01/09) : sans cette branche le panneau
   *  titrait « Pays neutre » sur la France d'un joueur français, ce que la rose des vents savait
   *  déjà ne pas dire. Aucune ligne ne change dessous — c'est le titre qui mentait. */
  const mine = nation !== undefined && nation === view.me.nation;

  const title = mine
    ? fr.selectedCountry.myTitle
    : opponent
      ? fr.selectedCountry.enemyTitle
      : fr.selectedCountry.neutralTitle;
  const marker =
    hoveredCountry === null ? fr.selectedCountry.marker : fr.selectedCountry.hoverMarker;

  const heldBy =
    holding === null
      ? null
      : holding.state === 'current'
        ? nationLabel(holding.nation)
        : fr.selectedCountry.heldBySurveyed(
            nationLabel(holding.nation),
            asPressDate(holding.seenAt),
          );

  /* **Ce que le pays porte, et rien d'autre** : la plage de repos d'un adversaire ne se lit nulle
     part ailleurs en saison, l'avant-poste planté ici se nomme. Un « aucun » ne paraît plus — la
     carte montre déjà qu'il n'y a pas de mât. La progression et le dernier renseignement, toujours
     à zéro et à « — » tant que la part de carte et la surface 4.9 n'existent pas, sont partis. */
  const countryLines = opponent && view.mode === 'blitz' ? null : opponent ? (
    <Line label={fr.selectedCountry.restWindow} value={opponent.restWindow} />
  ) : outpost ? (
    <>
      <Line
        label={fr.selectedCountry.outpost}
        value={`${outpost.isMine ? nationLabel(view.me.nation) : fr.selectedCountry.enemyOwner} — ${fr.specializations[outpost.specialization]}`}
      />
      <Line label={fr.selectedCountry.garrison} value={`${outpost.garrison}`} />
    </>
  ) : null;

  if (hovered === null) {
    return (
      <GroundCard
        title={title}
        marker={marker}
        heading={countryLabel(country)}
        onDeselect={onDeselect}
      >
        {countryLines}
      </GroundCard>
    );
  }

  const held = heldBy !== null && <Line label={fr.selectedCountry.heldBy} value={heldBy} />;
  const ground = (
    <>
      <p className={QUIET}>
        {deposit === null ? fr.board.regionNoDeposit : fr.board.regionDeposit(fr.deposits[deposit])}
      </p>
      {coastal.has(hovered.id) && <p className={QUIET}>{fr.board.regionCoastal}</p>}
      {suspendedUntil !== null && (
        <Line
          label={fr.selectedCountry.suspended}
          value={fr.selectedCountry.suspendedUntil(asClockTime(suspendedUntil))}
        />
      )}
    </>
  );

  /* Au doigt, la feuille s'ouvre à l'aperçu et porte déjà son titre : la région touchée devient
     le titre de l'affiche, son pays et son terrain la ligne dessous, le reste derrière
     « détails ». */
  if (narrow) {
    return (
      <GroundCard title={title} marker={marker} heading={hovered.name} onDeselect={onDeselect}>
        <p className={QUIET}>
          {countryLabel(country)} — {fr.regionTypes[hovered.type]}
        </p>
        {held}
        <details>
          <summary className="eyebrow cursor-pointer py-[6px]">
            {fr.selectedCountry.moreDetails}
          </summary>
          <div className="grid gap-[5px]">
            {ground}
            {countryLines}
          </div>
        </details>
      </GroundCard>
    );
  }

  return (
    <GroundCard
      title={title}
      detail={hovered.name}
      marker={marker}
      heading={countryLabel(country)}
      onDeselect={onDeselect}
    >
      <p className={QUIET}>{fr.board.regionTerrain(fr.regionTypes[hovered.type])}</p>
      {ground}
      {held}
      {countryLines}
    </GroundCard>
  );
}

const QUIET = 'text-[12.5px] leading-[1.3] text-[var(--ink-soft)]';

/** L'affiche du sol : le surtitre et le pays, puis ce qu'on en sait. */
function GroundCard({
  title,
  detail,
  marker,
  heading,
  onDeselect,
  children,
}: {
  title: string;
  detail?: string;
  marker: string;
  heading: string;
  onDeselect: () => void;
  children: ReactNode;
}) {
  return (
    <Panel
      title={title}
      {...(detail === undefined ? {} : { detail })}
      marker={marker}
      position="static"
      width={236}
      onClose={onDeselect}
      compact
    >
      <div className="grid gap-[5px] text-[13px] leading-[1.25] text-[var(--ink)]">
        <h3 className="font-(family-name:--font-display) text-[18px] leading-[1.05] font-bold">
          {heading}
        </h3>
        {children}
      </div>
    </Panel>
  );
}

/** Une ligne chiffrée de l'affiche : l'intitulé à gauche, la valeur en mono à droite. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="map-poster-row">
      <span className="text-[var(--ink-soft)]">{label}</span>
      <b className="map-poster-num font-medium">{value}</b>
    </div>
  );
}

/**
 * **Le littoral arrive après le plateau** : il vit dans `region-index.json`, 312 ko dont un seul
 * fait intéresse cet écran, et il n'a rien à faire dans le bundle de démarrage. La promesse est
 * partagée par le module, donc rouvrir le panneau ne relance rien. Tant qu'elle n'a pas répondu,
 * la ligne « côtière » manque et rien d'autre ne bouge.
 */
const NO_COAST: ReadonlySet<string> = new Set();

function useCoastalRegions(): ReadonlySet<string> {
  const [coastal, setCoastal] = useState<ReadonlySet<string>>(NO_COAST);
  useEffect(() => {
    let abandoned = false;
    void loadCoastalRegions().then((regions) => {
      if (!abandoned) setCoastal(regions);
    });
    return () => {
      abandoned = true;
    };
  }, []);
  return coastal;
}
