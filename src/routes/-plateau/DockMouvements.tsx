import { Link } from '@tanstack/react-router';
import { useHorloge } from '@/coque/horloge';
import type { ArcAffiche, VueJoueur } from '@/domaine/vue-joueur';
import { LIBELLE_TYPE, libellePile, minutesCourantes } from '@/domaine/vue-joueur';
import { enHeuresMinutes } from './duree';

export function DockMouvements({ vue }: { vue: VueJoueur }) {
  const { slots } = vue.moi;
  const maintenant = useHorloge();
  return (
    <aside className="hud trame-papier flex w-[430px] shrink-0 flex-col border-r border-[var(--ink)]">
      <div className="flex items-baseline justify-between border-b border-[var(--ink)] px-[18px] pt-[13px] pb-[10px]">
        <h2 className="font-[var(--font-display)] text-[16px] font-extrabold tracking-[.02em] text-[var(--ink)]">
          MOUVEMENTS EN COURS
        </h2>
        <span className="text-[11px] text-[var(--ink-soft)]">
          {slots.utilises} slots · {slots.total - slots.utilises} dispo.
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {vue.arcs.map((arc) => (
          <LigneMouvement key={arc.id} arc={arc} chargeeA={vue.chargeeA} maintenant={maintenant} />
        ))}
        <p className="px-[18px] pt-3 pb-5 text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
          Un arc adverse n’expose ni son type ni sa composition. Un arc grisé est une dernière
          position connue, horodatée.
        </p>
      </div>

      <Link
        to="/plateau"
        search={(precedente) => ({ ...precedente, vue: 'mouvements' as const, modale: 'envoi' as const })}
        className="shrink-0 bg-[var(--ink)] p-[15px] text-center text-[12px] tracking-[.22em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)]"
      >
        envoyer un mouvement
      </Link>
    </aside>
  );
}

function LigneMouvement({ arc, chargeeA, maintenant }: { arc: ArcAffiche; chargeeA: number; maintenant: number }) {
  const ligne = versLigne(arc, chargeeA, maintenant);
  return (
    <div className="border-b border-[rgba(42,33,24,.22)] px-[18px] py-[11px]">
      <div className="flex items-center gap-[9px]">
        <span className="h-[9px] w-[9px]" style={{ background: ligne.encre, opacity: ligne.opaciteEncre }} />
        <span className="text-[10px] tracking-[.18em] text-[var(--ink-soft)] uppercase">{ligne.etat}</span>
        <span className="h-px flex-1 bg-[rgba(42,33,24,.16)]" />
        <span className="font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">{ligne.eta}</span>
      </div>
      <div className="mt-[6px] flex items-baseline gap-[10px]">
        <span className="text-[15px] font-semibold text-[var(--ink)]" style={{ opacity: ligne.opaciteType }}>
          {ligne.type}
        </span>
        <span className="text-[13px] text-[var(--ink-soft)]">{ligne.route}</span>
      </div>
      <div className="mt-1 text-[12px] text-[var(--ink-soft)]">{ligne.composition}</div>
    </div>
  );
}

type Ligne = {
  etat: string;
  type: string;
  encre: string;
  opaciteEncre: number;
  opaciteType: number;
  route: string;
  composition: string;
  eta: string;
};

function versLigne(arc: ArcAffiche, chargeeA: number, maintenant: number): Ligne {
  switch (arc.etat) {
    case 'mien':
      return {
        etat: `mien — ${LIBELLE_TYPE[arc.type]}`,
        type: LIBELLE_TYPE[arc.type],
        encre: 'var(--interaction)',
        opaciteEncre: 1,
        opaciteType: 1,
        route: `${arc.origineNom} → ${arc.destinationNom}`,
        composition: libellePile(arc.pile),
        eta: enHeuresMinutes(minutesCourantes(arc.minutesRestantes, chargeeA, maintenant)),
      };
    case 'adverseDetecte':
      return {
        etat: 'adverse détecté',
        type: 'type inconnu',
        encre: 'var(--critique)',
        opaciteEncre: 0.85,
        opaciteType: 0.45,
        route: `arc relevé — cap ${Math.round(arc.capDegres)}°`,
        composition: 'composition inconnue',
        eta: arc.minutesRestantesEstimees === null ? '—' : `~${enHeuresMinutes(arc.minutesRestantesEstimees)}`,
      };
    case 'dernierePositionConnue':
      return {
        etat: 'dernière position connue',
        type: 'type inconnu',
        encre: 'var(--routine)',
        opaciteEncre: 0.45,
        opaciteType: 0.35,
        route: `arc figé — cap ${Math.round(arc.capDegres)}°`,
        composition: `vu il y a ${arc.vuIlYaMinutes} min`,
        eta: '—',
      };
    case 'maitriseDesMers':
      return {
        etat: 'maîtrise des mers',
        type: 'arc maritime',
        encre: 'var(--ink-royaume-uni)',
        opaciteEncre: 0.7,
        opaciteType: 0.5,
        route: 'extrémités effacées',
        composition: 'ni origine ni destination',
        eta: '—',
      };
  }
}
