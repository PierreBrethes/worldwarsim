/** Typographie française : une espace insécable avant « : ; ! ? », pour qu'un titre ne commence
 *  jamais sa ligne par la ponctuation. À poser sur les titres qui reviennent à la ligne. */
export const typo = (text: string): string => text.replace(/ (?=[:;!?])/g, ' ');
