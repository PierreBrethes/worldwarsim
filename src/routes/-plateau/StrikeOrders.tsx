import { fr } from '@/i18n/fr';
import { noShipFor, type Offer } from '@/domain/offers';

type Struck = Extract<Offer, { key: 'strike' | 'march' }>;

const struckOf = (offers: ReadonlyArray<Offer>): Struck[] =>
  offers.filter((offer): offer is Struck => offer.key === 'strike' || offer.key === 'march');

/** **L'ordre de tête de la fiche courte** : la première pile qui peut partir, sinon la première
 *  dite — une pile refusée porte sa phrase, jamais un bouton éteint (ADR 0015). */
export const leadOffersOf = (offers: ReadonlyArray<Offer>): ReadonlyArray<Offer> => {
  const struck = struckOf(offers);
  const best = struck.find((offer) => offer.refusal === null) ?? struck[0];
  return best === undefined ? [] : [best];
};

/**
 * **Une pile, un ordre, un toucher** (#588, décision de Pierre du 19/11) : « Attaquer » ou
 * « Marcher et capturer » part directement de la fiche, la pile nommée sur le bouton, sans visée ni
 * « Envoyer ». Une pile qui ne peut pas y aller dit pourquoi à la place du bouton, avec la phrase du
 * serveur. Quand toutes disent la même chose — aucune ne prend la mer —, la fiche ne le dit qu'une
 * fois. Sans pile du tout, elle dit qu'il n'y en a pas à portée.
 */
export function StrikeOrders({
  offers,
  empty = true,
  onOffer,
}: {
  offers: ReadonlyArray<Offer>;
  /** Sans offre, dire qu'aucune pile n'est à portée (faux pour un point que je tiens). */
  empty?: boolean;
  onOffer: (offer: Offer) => void;
}) {
  const struck = struckOf(offers);
  const quiet = 'text-[11.5px] leading-[1.4] text-[var(--ink-soft)]';
  if (noShipFor(offers))
    return (
      <p className={`mt-[8px] text-[11.5px] leading-[1.4] text-[var(--critical)]`}>
        {fr.strikes.noShip}
      </p>
    );
  if (struck.length === 0)
    return empty ? <p className={`mt-[8px] ${quiet}`}>{fr.strikes.noPile}</p> : null;
  return (
    <ul className="mt-[8px] flex flex-col gap-[6px]">
      {struck.map((offer) => {
        const place = fr.strikes.pile(offer.pile.place, offer.pile.troopIds.length);
        const verb = offer.key === 'strike' ? fr.drop.verbs.attack : fr.strikes.takeVerb;
        return (
          <li key={`${offer.key}-${offer.pile.troopIds.join()}`}>
            {offer.refusal === null ? (
              <button
                type="button"
                onClick={() => onOffer(offer)}
                className="flex min-h-[48px] w-full cursor-pointer flex-col justify-center border border-[var(--ink)] px-[12px] py-[6px] text-left hover:bg-[var(--ink)] hover:text-[var(--paper)]"
              >
                <span className="text-[11px] font-bold tracking-[.18em] uppercase">{verb}</span>
                <span className="font-(family-name:--font-mono) text-[10.5px] tracking-normal">
                  {place}
                </span>
              </button>
            ) : (
              <p className="px-[2px] py-[2px] text-[10.5px] leading-[1.4]">
                <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
                  {place}
                </span>
                <span className="block text-[var(--critical)]">{offer.refusal}</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
