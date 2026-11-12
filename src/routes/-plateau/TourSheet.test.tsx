// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { launchRefusalOf, loopOf, orderBest, rankStops, type SheetStop } from '@/domain/tour-sheet';
import { cardsOf, readSheet } from '@/domain/tour-sheet-view';
import type { Projection } from '@/domain/world';
import { fr } from '@/i18n/fr';
import projectionAsset from '../../../public/projection.json';
import { TourSheet } from './TourSheet';
import type { TourSheetState } from './useTourSheet';

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
Element.prototype.scrollIntoView = () => {};
afterEach(cleanup);

const NOW = 100 * 3_600_000;
const view = {
  mode: 'mondiale',
  loadedAt: NOW,
  me: {
    troops: [
      {
        id: 'T',
        role: 'landTransport',
        stationedAt: { kind: 'building', buildingId: 'hq' },
        load: { ammunition: 80, oil: 0, coal: 0 },
      },
    ],
    outposts: [
      {
        id: 'O',
        hostCountry: 'FRA',
        lonLat: [5, 49],
        regionId: 'R',
        isMine: true,
        level: 2,
        standsAt: null,
        depot: { ammunition: 20, oil: 0, coal: 0 },
        depotCapacity: 150,
      },
    ],
    buildings: [
      { id: 'hq', key: 'hq', name: 'Quartier général', point: [2.35, 48.86] },
      {
        id: 'a',
        key: 'mine',
        name: 'Mine',
        regionId: 'R',
        point: [3, 50],
        heap: { amount: 100, cap: 288, resource: 'coal' },
      },
    ],
    regions: [{ id: 'R', name: 'Lorraine' }],
    extraction: [{ buildingId: 'a', heapPerHour: 40, linked: true }],
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 100, ratePerHour: 0, cap: 1000 }]),
    ),
  },
} as unknown as PlayerView;

/** Un état de feuille tel que `useTourSheet` le sert, mais sans serveur : les arrêts sont donnés. */
function stateOf(
  ids: ReadonlyArray<string>,
  over: Partial<TourSheetState> = {},
  picking = false,
  routed = true,
): TourSheetState {
  const reading = readSheet(
    view,
    'T',
    [{ buildingId: 'a', routed, hasQuay: false, stopPoint: null }],
    projectionAsset as unknown as Projection,
    NOW,
  )!;
  const stops = ids.map((id) => reading.candidates.find((one) => one.id === id)!) as SheetStop[];
  const loop = loopOf(reading.sheet, stops);
  return {
    carrierId: 'T',
    reading,
    touring: false,
    picking,
    startPicking: vi.fn(),
    stopPicking: vi.fn(),
    pinned: null,
    proposed: false,
    proposing: false,
    stops,
    cards: cardsOf(stops, loop, reading.nameOf, null),
    analysis: {
      loop,
      ranked: picking ? rankStops(reading.sheet, stops, reading.candidates) : null,
      order: stops.length > 1 ? orderBest(reading.sheet, stops) : null,
      refusal: launchRefusalOf(reading.sheet, stops),
    },
    pick: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
    clear: vi.fn(),
    orderBestNow: vi.fn(),
    propose: vi.fn(),
    launch: vi.fn(),
    recall: vi.fn(),
    onTour: vi.fn(),
    marks: new Map(),
    loops: [],
    pending: false,
    ...over,
  };
}

/** **La feuille de route** (#551) : ce qu'elle montre d'une tournée, et ce que chaque geste appelle. */
describe('the transport route sheet', () => {
  it('shows the loading point, each stop as a card, and the return that banks', () => {
    const { container } = render(<TourSheet sheet={stateOf(['O', 'a'])} />);
    const cards = [...container.querySelectorAll('[data-stop]')].map((node) => node.textContent);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain('▼ donne 80');
    expect(cards[1]).toContain('▲ prend');
    expect(container.querySelectorAll('.tour-nm')[0]?.textContent).toBe('Quartier général');
    expect(screen.getByText(fr.tourSheet.returnTo('Quartier général'))).toBeTruthy();
  });

  it('offers « proposer » on an empty sheet only', () => {
    const empty = render(<TourSheet sheet={stateOf([])} />);
    expect(screen.queryByText(fr.tourSheet.propose)).not.toBeNull();
    empty.unmount();
    render(<TourSheet sheet={stateOf(['O'])} />);
    expect(screen.queryByText(fr.tourSheet.propose)).toBeNull();
  });

  it('opens the empty card on « ajouter », and a row of it picks that stop', () => {
    const sheet = stateOf(['O']);
    const first = render(<TourSheet sheet={sheet} />);
    fireEvent.click(screen.getByText(fr.tourSheet.add));
    expect(sheet.startPicking).toHaveBeenCalled();
    first.unmount();
    const picking = stateOf(['O'], {}, true);
    const { container } = render(<TourSheet sheet={picking} />);
    fireEvent.click(container.querySelector('[data-offer]')!);
    expect(picking.pick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'site', id: 'a' }));
  });

  it('removes a card from its ✕, and lists a refused stop apart, in red, with its reason', () => {
    const sheet = stateOf(['O']);
    const { container, unmount } = render(<TourSheet sheet={sheet} />);
    fireEvent.click(container.querySelector('.tour-rm')!);
    expect(sheet.remove).toHaveBeenCalledWith(0);
    unmount();
    const lit = render(<TourSheet sheet={stateOf(['O'], {}, true, false)} />);
    expect(lit.container.querySelector('.tour-opt--no')?.textContent).toContain('aucune route');
  });

  it('moves a card dragged by its grip, and nothing if it is dropped where it was', () => {
    const sheet = stateOf(['O', 'a']);
    const { container } = render(<TourSheet sheet={sheet} />);
    const grip = container.querySelector('.tour-grip')!;
    fireEvent.pointerDown(grip, { pointerType: 'mouse', clientY: 10 });
    fireEvent(window, new MouseEvent('pointermove', { clientY: 500 }));
    fireEvent(window, new MouseEvent('pointerup', { clientY: 500 }));
    expect(sheet.move).toHaveBeenCalledWith(0, 1);
  });

  it('reads a running tour: no grip, no removal, and « rappeler » instead of « lancer »', () => {
    const sheet = stateOf(['O'], { touring: true });
    const { container } = render(<TourSheet sheet={sheet} />);
    expect(container.querySelector('.tour-grip')).toBeNull();
    expect(container.querySelector('.tour-rm')).toBeNull();
    fireEvent.click(screen.getByText(fr.tourSheet.recall));
    expect(sheet.recall).toHaveBeenCalledWith('T');
    expect(screen.queryByText(fr.tourSheet.launch)).toBeNull();
  });

  it('says the exploitations are being read while « proposer » waits for them', () => {
    render(<TourSheet sheet={stateOf([], { proposing: true })} />);
    expect(screen.getByText(fr.tourSheet.pickLoading)).toBeTruthy();
    expect(screen.queryByText(fr.tourSheet.proposeAsk)).toBeNull();
  });

  it('says why an empty sheet cannot leave only once it has a stop', () => {
    const { container } = render(<TourSheet sheet={stateOf([])} />);
    expect(container.querySelector('.tour-refusal')).toBeNull();
  });
});
