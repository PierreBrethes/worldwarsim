import type { ArcAffiche } from '@/domaine/vue-joueur';
import { Ligne, Panneau } from './Panneau';

const enHeuresMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;

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
        <Ligne key={arc.id} libelle={arc.type} valeur={enHeuresMinutes(arc.minutesRestantes)} />
      ))}
    </Panneau>
  );
}
