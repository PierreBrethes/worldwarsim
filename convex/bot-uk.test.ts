import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { crossesToward, MIDDAY } from './bot.fixture';

describe("un bot insulaire débarque près d'un point neutre (uk)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it(
    'un cargo porte sa colonne vers Lisbonne, que la colonne prend ensuite à pied',
    () => crossesToward('uk', 'lisbon', true),
    600_000,
  );
});
