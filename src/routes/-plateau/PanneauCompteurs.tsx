import type { ArcAffiche } from '@/domaine/vue-joueur';
import { LIBELLE_TYPE } from '@/domaine/vue-joueur';
import { enHeuresMinutes } from './duree';
import { Ligne, Panneau } from './Panneau';

export function PanneauCompteurs({ arcs }: { arcs: ReadonlyArray<ArcAffiche> }) {
  const miens = arcs.filter((arc) => arc.etat === 'mien');
  const prochaine = miens.reduce<number | null>(
    (minimum, arc) => (minimum === null ? arc.minutesRestantes : Math.min(minimum, arc.minutesRestantes)),
    null,
  );

  return (
    <Panneau titre="Compteurs" position="basGauche">
      <Ligne libelle="prochaine arrivée" valeur={prochaine === null ? '—' : enHeuresMinutes(prochaine)} />
      {miens.map((arc) => (
        <Ligne key={arc.id} libelle={LIBELLE_TYPE[arc.type]} valeur={enHeuresMinutes(arc.minutesRestantes)} />
      ))}
    </Panneau>
  );
}
