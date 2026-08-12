import { typeDeRegion } from '@/domaine/monde';

/**
 * L'infobulle de la région survolée, empilée au-dessus du panneau États d'arc. Le type
 * affiché vient de `typeDeRegion` — un factice assumé en attendant la passe de terrain.
 */
export function InfoBulleRegion({ nom }: { nom: string }) {
  return (
    <aside className="hud trame-papier z-10 w-[210px] border border-[var(--ink)] px-3 py-2">
      <span className="eyebrow block">Région</span>
      <p className="mt-1 text-[13px] text-[var(--ink)]">{nom}</p>
      <p className="text-[11.5px] text-[var(--ink-soft)] italic">{typeDeRegion(nom)}</p>
    </aside>
  );
}
