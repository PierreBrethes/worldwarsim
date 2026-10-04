// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FloatingWindow } from './Window';
import { Panel } from './Panel';

/**
 * **Le seuil change le cadre, jamais le contenu** (décision du 15/09). Ce qui se vérifie ici est
 * la seule chose que les huit fenêtres et les trois panneaux aient en commun : sous 768 px une
 * fenêtre tient l'écran entre le bandeau et la barre de pied sans qu'on la pousse ni la
 * redimensionne, un panneau est la feuille basse (piste A, passe 2) — et au-dessus du seuil rien n'a bougé, ce qui est le cas d'acceptation
 * 7 (captures identiques au bureau).
 *
 * jsdom ne met rien en page et n'évalue aucune requête média : `matchMedia` est donc posée à la
 * main, ce qui est aussi la façon la plus honnête d'écrire « à telle largeur ».
 */
const atWidth = (pixels: number): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: pixels <= Number(/(\d+)px/.exec(query)?.[1] ?? 0),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
};

/** jsdom n'a pas de `ResizeObserver`, et le cadre de bureau en monte un pour retenir la surface
 *  dans l'écran (`dragging.ts`). La feuille, elle, n'en monte aucun — c'est précisément ce que
 *  « ni déplacement ni redimensionnement » veut dire. */
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

const frame = { rank: 0, inFront: true, onBringForward: () => {}, onClose: () => {} };

afterEach(cleanup);

it('lays a window flat on the screen under the threshold', () => {
  atWidth(375);
  const { container } = render(
    <FloatingWindow name="journal" width={1040} {...frame}>
      <p>dépêches</p>
    </FloatingWindow>,
  );

  const sheet = container.querySelector<HTMLElement>('.board-window');
  expect(sheet).not.toBeNull();
  expect(container.querySelector('[title]')).toBeNull();
  expect(container.querySelector('.resize-corner')).toBeNull();
  expect(sheet?.style.transform).toBe('');
});

/** Recouverte, une feuille se ferme par son propre geste — une fois, quoi qu'il se redessine. */
it('closes a narrow window that another one covers, once', () => {
  atWidth(375);
  const onClose = vi.fn();
  const { rerender } = render(
    <FloatingWindow name="journal" width={1040} {...frame} onClose={onClose}>
      <p>dépêches</p>
    </FloatingWindow>,
  );
  expect(onClose).not.toHaveBeenCalled();

  for (const _ of [1, 2]) {
    rerender(
      <FloatingWindow name="journal" width={1040} {...frame} inFront={false} onClose={onClose}>
        <p>dépêches</p>
      </FloatingWindow>,
    );
  }
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('keeps the desk window above the threshold', () => {
  atWidth(1280);
  const { container } = render(
    <FloatingWindow name="journal" width={1040} {...frame}>
      <p>dépêches</p>
    </FloatingWindow>,
  );

  expect(container.querySelector('.board-window')).toBeNull();
  expect(container.querySelector('.resize-corner')).not.toBeNull();
  expect(container.querySelector<HTMLElement>('[role="dialog"]')?.style.width).toBe(
    'min(1040px, 100%)',
  );
});

it('anchors a panel at the foot of a narrow screen, outside the push its caller applies', () => {
  atWidth(375);
  const { container } = render(
    <Panel title="Garnison" position="static">
      <p>une pile</p>
    </Panel>,
  );

  // Le portail : la feuille sort du cadre de l'appelant pour se mesurer sur l'écran.
  expect(container.querySelector('.board-sheet')).toBeNull();
  expect(document.body.querySelector('.board-sheet')).not.toBeNull();
});

it('leaves the panel where the board anchors it above the threshold', () => {
  atWidth(1280);
  const { container } = render(
    <Panel title="Garnison" position="static">
      <p>une pile</p>
    </Panel>,
  );

  expect(document.body.querySelector('.board-sheet')).toBeNull();
  expect(container.querySelector('section')?.className).toContain('relative');
});
