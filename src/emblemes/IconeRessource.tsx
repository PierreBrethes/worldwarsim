export type CleRessource = 'ravitaillement' | 'acier' | 'effectifs';

/**
 * Silhouettes pleines, sans contour ni détail intérieur : c'est ce qui tient à 12 px.
 * Chaque forme est distincte à la découpe — carré barré, empilement triangulaire, dôme —
 * donc reconnaissable même quand la couleur ne passe pas.
 *
 * L'icône ne remplace jamais le chiffre. Elle remplace le *mot* quand la place manque.
 * En dessous de 12 px elle devient illisible : préférer alors le chiffre seul.
 */
const TRACE_PAR_RESSOURCE: Readonly<Record<CleRessource, string>> = {
  ravitaillement:
    'M2 4h20v2H2zM2 18h20v2H2zM2 4h2v16H2zM20 4h2v16h-2zM5.6 5.2 19 17.2l-1.4 1.6L4.2 6.8zM18.4 5.2 19.8 6.8 6.4 18.8 5 17.2z',
  acier: 'M9.4 5.6h5.2l2.4 6.4H7zM4.4 12h5.2l2.4 6.4H2zM14.4 12h5.2l2.4 6.4H12z',
  effectifs: 'M12 3c-4.6 0-8.3 3.6-8.3 8.1v1.4H1.6v3.1h20.8v-3.1h-2.1v-1.4C20.3 6.6 16.6 3 12 3z',
};

/** Sur papier, les trois teintes sont assombries pour tenir le contraste. */
export function couleurRessource(ressource: CleRessource, surPapier = false): string {
  return `var(--${ressource}${surPapier ? '-papier' : ''})`;
}

export function IconeRessource({ ressource, taille = 12 }: { ressource: CleRessource; taille?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={taille} height={taille} fill="currentColor" aria-hidden>
      <path d={TRACE_PAR_RESSOURCE[ressource]} />
    </svg>
  );
}
