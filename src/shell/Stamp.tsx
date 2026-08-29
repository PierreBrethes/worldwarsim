/**
 * **Le tampon : un acte, ou un état administratif constaté.** Jamais une étiquette — « relevé »,
 * « désactivé », « saison close » sont des choses que quelqu'un a *tamponnées* ; « nourriture »
 * ou « 3 troupes » n'en sont pas, et les mettre dans un cadre au trait ne les rendrait pas plus
 * officielles, seulement plus bruyantes.
 *
 * **Trois règles, et elles tiennent l'ensemble :**
 *
 * 1. Un tampon constate. Il ne titre pas, il ne compte pas, il ne se clique pas — le geste
 *    tamponné existe déjà (le bouton COMPRIS de la notice, POSÉE de l'accueil) ; celui-ci est
 *    son revers, l'**état** qu'un geste a laissé derrière lui.
 * 2. **Deux par surface au plus.** Un écran couvert de cachets est un écran où plus rien n'est
 *    officiel. La marge du journal est l'exception qui confirme : une dépêche est une surface,
 *    et elle en porte un.
 * 3. **L'encre rouge est réservée.** Elle dit ce qui exige l'attention — une attaque subie, un
 *    avant-poste tombé, un tir à sec, un relevé. Tout le reste passe à l'encre, y compris ce qui
 *    est grave mais acquis.
 *
 * **La rotation est dérivée du texte, jamais tirée au rendu.** Un cachet qui bouge à chaque
 * repeint est une animation que personne n'a demandée, et sur une liste il fait vibrer la page.
 * Le même mot penche du même côté pour toute la saison, ce qui est exactement ce qu'un tampon
 * physique fait.
 */
export function Stamp({
  label,
  tone = 'ink',
  size = 'default',
}: {
  label: string;
  /** `critical` est l'encre rouge de la règle 3 ; tout le reste prend l'encre du support. */
  tone?: 'ink' | 'critical';
  size?: 'default' | 'small';
}) {
  const small = size === 'small';
  return (
    <span
      className="inline-block shrink-0 whitespace-nowrap uppercase"
      style={{
        /**
         * **Le support décide de son encre, pas le composant.** `--ink` sur papier, et un fond
         * sombre — le widget de troupes, le bandeau — pose `--stamp-ink` sur un ancêtre : deux
         * encres à l'API, une lisibilité partout, plutôt qu'un troisième ton à choisir à chaque
         * appel.
         */
        color: tone === 'critical' ? 'var(--critical)' : 'var(--stamp-ink, var(--ink))',
        border: '1.5px solid currentColor',
        transform: `rotate(${tiltOf(label)}deg)`,
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: small ? 9 : 12,
        letterSpacing: small ? '.2em' : '.24em',
        lineHeight: 1,
        padding: small ? '3px 6px 2px 7px' : '6px 12px 5px 14px',
      }}
    >
      {label}
    </span>
  );
}

/**
 * ±1°, par pas d'un dixième, tiré du texte lui-même. Le hachage n'a rien à défendre : il ne sert
 * qu'à ce que deux mots voisins ne penchent pas pareil, et à ce que le même penche toujours
 * pareil. Zéro est écarté — un cachet parfaitement droit est un cadre, pas un cachet.
 */
function tiltOf(label: string): number {
  const hash = [...label].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 7);
  const tenths = (hash % 20) - 10;
  return (tenths < 0 ? tenths : tenths + 1) / 10;
}
