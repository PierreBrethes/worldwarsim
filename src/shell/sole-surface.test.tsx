// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRouter,
} from '@tanstack/react-router';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoleSurfaceProvider, useBareMapTap, useSoleSurface } from './sole-surface';

/**
 * **Un seul retour pour une feuille ouverte** (#584) : le fournisseur pose une entrée d'historique
 * quand une feuille réclame la place, la retire quand elle la rend, et le retour du navigateur
 * ferme la feuille par son propre geste. Les surfaces d'URL (`marks` à faux) n'en posent pas.
 */
afterEach(cleanup);

type Held = { readonly id: string; readonly marks: boolean };

function Surface({ id, marks, onClose }: Held & { onClose: (id: string) => void }) {
  useSoleSurface(() => onClose(id), true, marks);
  return <p>{id}</p>;
}

let show: (...held: ReadonlyArray<Held>) => void = () => {};
const closed = vi.fn<(id: string) => void>();
let tapped: (name: string | null) => void = () => {};
const read = vi.fn<(name: string | null) => void>();

function Tapper({ keep }: { keep: boolean }) {
  tapped = useBareMapTap(read, keep);
  return null;
}

function Board({ keep }: { keep: boolean }) {
  const [held, setHeld] = useState<ReadonlyArray<Held>>([]);
  show = (...next) => void act(() => setHeld(next));
  return (
    <SoleSurfaceProvider>
      <Tapper keep={keep} />
      {held.map((surface) => (
        <Surface
          key={surface.id}
          {...surface}
          onClose={(id) => {
            closed(id);
            setHeld((now) => now.filter((other) => other.id !== id));
          }}
        />
      ))}
    </SoleSurfaceProvider>
  );
}

async function mount(at = '/plateau', keep = false): Promise<AnyRouter> {
  closed.mockClear();
  read.mockClear();
  const root = createRootRoute();
  const board = createRoute({
    getParentRoute: () => root,
    path: '/plateau',
    component: () => <Board keep={keep} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([board]),
    history: createMemoryHistory({ initialEntries: [at] }),
  });
  render(<RouterProvider router={router} />);
  await act(async () => {
    await router.load();
  });
  return router;
}

const index = (router: AnyRouter): number => router.history.location.state.__TSR_index;
/** Le temps qu'une libération laisse à une surface qui la reprend aussitôt. */
const settled = () => act(async () => void (await Promise.resolve()));

describe('the history entry of a held sheet', () => {
  it('pushes one entry while a sheet is open, and Back closes it through its own close', async () => {
    const router = await mount();
    show({ id: 'garnison', marks: true });
    await settled();
    expect(index(router)).toBe(1);

    await act(async () => router.history.back());
    expect(closed).toHaveBeenCalledExactlyOnceWith('garnison');
    expect(screen.queryByText('garnison')).toBeNull();
    expect(index(router)).toBe(0);
  });

  it('takes its entry back when the sheet closes by its own gesture', async () => {
    const router = await mount();
    show({ id: 'garnison', marks: true });
    await settled();
    show();
    await settled();
    expect(index(router)).toBe(0);
  });

  /** La feuille du sol : sa sélection est dans l'adresse, et sa fermeture la retire. */
  it('gives the address back that the sheet closed, not the one it was opened on', async () => {
    const router = await mount('/plateau?country=FRA');
    show({ id: 'sol', marks: true });
    await settled();
    await act(async () => router.history.replace('/plateau'));
    show();
    await settled();
    expect(router.history.location.href).toBe('/plateau');
    expect(index(router)).toBe(0);
  });

  it('keeps the one entry when a sheet replaces another', async () => {
    const router = await mount();
    show({ id: 'camp', marks: true });
    await settled();
    show({ id: 'camp', marks: true }, { id: 'butin', marks: true });
    await settled();
    expect(closed).toHaveBeenCalledExactlyOnceWith('camp');
    expect(index(router)).toBe(1);

    await act(async () => router.history.back());
    expect(closed).toHaveBeenLastCalledWith('butin');
    expect(index(router)).toBe(0);
  });

  it('leaves a surface of the address alone: it pushes nothing, and its release pops nothing', async () => {
    const router = await mount();
    show({ id: 'journal', marks: false });
    await settled();
    expect(index(router)).toBe(0);
    show();
    await settled();
    expect(index(router)).toBe(0);
  });

  it('takes the entry back when a surface that marks nothing replaces the sheet', async () => {
    const router = await mount();
    show({ id: 'camp', marks: true });
    await settled();
    show({ id: 'camp', marks: true }, { id: 'rose', marks: false });
    await settled();
    expect(index(router)).toBe(0);
  });

  it('does not pop an entry that a window was pushed over', async () => {
    const router = await mount();
    show({ id: 'camp', marks: true });
    await settled();
    router.history.push('/plateau?windows=journal');
    show({ id: 'camp', marks: true }, { id: 'journal', marks: false });
    await settled();
    expect(index(router)).toBe(2);
  });
});

describe('a touch on the bare map', () => {
  it('closes the open surface and reads nothing', async () => {
    await mount();
    show({ id: 'camp', marks: true });
    await settled();
    tapped('FRA');
    expect(closed).toHaveBeenCalledExactlyOnceWith('camp');
    expect(read).not.toHaveBeenCalled();
  });

  it('reads the ground when nothing is open', async () => {
    await mount();
    tapped('FRA');
    expect(read).toHaveBeenCalledExactlyOnceWith('FRA');
  });

  it('reads the ground over a piece in hand, which keeps its place', async () => {
    await mount('/plateau', true);
    show({ id: 'main', marks: true });
    await settled();
    tapped('FRA');
    expect(closed).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledExactlyOnceWith('FRA');
  });
});
