import { Picto } from '@/coque/GlypheIndicateur';

export type CleRessource = 'ravitaillement' | 'acier' | 'effectifs';

/** Sur papier, les trois teintes sont assombries pour tenir le contraste. */
export function couleurRessource(ressource: CleRessource, surPapier = false): string {
  return `var(--${ressource}${surPapier ? '-papier' : ''})`;
}

/**
 * Ce que chaque dessin réclame pour peser autant que les deux autres. L'acier et les effectifs
 * occupent moins de leur carré que la caisse de ravitaillement et se perdaient à côté d'elle :
 * le facteur rattrape le dessin, il ne corrige pas une mise en page. D'où sa place ici — un
 * appelant qui demande douze pixels demande une icône lisible, pas une boîte de douze pixels.
 */
const FACTEUR: Readonly<Record<CleRessource, number>> = {
  ravitaillement: 2,
  acier: 2.5,
  effectifs: 2.5,
};

/**
 * L'icône ne remplace jamais le chiffre. Elle remplace le *mot* quand la place manque.
 *
 * Le masque prend son encre de `currentColor`, donc de la teinte que l'appelant pose sur le
 * conteneur — une ressource tarie ou une ligne sur papier n'a rien de plus à faire.
 */
export function IconeRessource({
  ressource,
  taille = 12,
}: {
  ressource: CleRessource;
  taille?: number;
}) {
  return <Picto picto={ressource} corps={40} taille={Math.round(taille * FACTEUR[ressource])} />;
}
