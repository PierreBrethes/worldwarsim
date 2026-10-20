import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { cardName, fr } from '@/i18n/fr';
import { Margin } from './ResearchWindow';

const NOW = Date.UTC(2026, 9, 20, 12);

/** La marge ne lit que la file : le reste de la vue n'a rien à y faire. */
const viewWith = (queue: PlayerView['me']['research']['queue']) =>
  ({
    me: {
      research: {
        researched: [],
        running: { card: 'artillery', totalMs: 3_600_000, remainingMs: 3_600_000, since: NOW },
        queue,
      },
    },
  }) as unknown as PlayerView;

describe('la marge du Centre de recherche', () => {
  it('dit pourquoi une carte attendue par une autre ne se retire pas, au lieu de l’offrir', () => {
    const markup = renderToStaticMarkup(
      <Margin
        view={viewWith(['aviation', 'bomber'])}
        level={1}
        now={NOW}
        narrow={false}
        remove={() => Promise.resolve()}
      />,
    );
    const [aviation, bomber] = markup.split('data-testid="research-waiting"').slice(1);

    expect(aviation).toContain(fr.errors.RESEARCH_NEEDED({ card: 'bomber' }));
    expect(aviation).not.toContain(fr.research.remove);
    expect(bomber).toContain(fr.research.remove);
    expect(bomber).toContain(cardName('bomber'));
  });
});
