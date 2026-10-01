// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSingleFlight } from './useSingleFlight';

/**
 * A second press on "fonder" while the first is still on its way founded a second season: the
 * server refuses nothing there. The guard lives on the front, where the double press happens.
 */
it('ignores a second call while the first is in flight', async () => {
  const { result } = renderHook(() => useSingleFlight());
  let release: () => void = () => {};
  const task = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        release = () => resolve('done');
      }),
  );

  let first: Promise<string | undefined> = Promise.resolve(undefined);
  let second: Promise<string | undefined> = Promise.resolve(undefined);
  await act(async () => {
    first = result.current.run(task);
    second = result.current.run(task);
  });

  expect(task).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toBe(true);

  await act(async () => {
    release();
    await first;
  });

  expect(await first).toBe('done');
  expect(await second).toBeUndefined();
  expect(result.current.pending).toBe(false);
});

it('lets a new call through once the first one has failed', async () => {
  const { result } = renderHook(() => useSingleFlight());

  await act(async () => {
    await expect(result.current.run(() => Promise.reject(new Error('refused')))).rejects.toThrow(
      'refused',
    );
  });
  expect(result.current.pending).toBe(false);

  let value: string | undefined;
  await act(async () => {
    value = await result.current.run(() => Promise.resolve('again'));
  });
  expect(value).toBe('again');
});
