import { useHorloge } from '@/coque/horloge';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { LIBELLE_TYPE, minutesCourantes } from '@/domaine/vue-joueur';
import { enHeuresMinutes } from './duree';
import { Ligne, Panneau } from './Panneau';

export function PanneauCompteurs({ arcs, chargeeA }: { arcs: ReadonlyArray<ArcAffiche>; chargeeA: number }) {
  const maintenant = useHorloge();
  const miens = arcs
    .filter((arc) => arc.etat === 'mien')
    .map((arc) => ({ ...arc, reste: minutesCourantes(arc.minutesRestantes, chargeeA, maintenant) }));
  const prochaine = miens.reduce<number | null>(
    (minimum, arc) => (minimum === null ? arc.reste : Math.min(minimum, arc.reste)),
    null,
  );

  return (
    <Panneau titre="Compteurs" position="basGauche">
      <Ligne libelle="prochaine arrivée" valeur={prochaine === null ? '—' : enHeuresMinutes(prochaine)} />
      {miens.map((arc) => (
        <Ligne key={arc.id} libelle={LIBELLE_TYPE[arc.type]} valeur={enHeuresMinutes(arc.reste)} />
      ))}
    </Panneau>
  );
}
