import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { runWithLoadingState, useAsyncEffect, useResource } from './useResource';

describe('runWithLoadingState (shared skeleton)', () => {
  const makeSetters = () => {
    const setLoading = vi.fn();
    const setError = vi.fn();
    return { setLoading, setError };
  };

  it('sets loading→true, clears error, then settles loading→false on success', async () => {
    const setters = makeSetters();
    const onError = vi.fn();
    const onSuccess = vi.fn();

    await runWithLoadingState(
      async () => 'value',
      setters,
      { fallbackMessage: 'fb', onError, onSuccess },
    );

    expect(setters.setLoading).toHaveBeenNthCalledWith(1, true);
    expect(setters.setError).toHaveBeenCalledWith('');
    expect(onSuccess).toHaveBeenCalledWith('value');
    expect(onError).not.toHaveBeenCalled();
    expect(setters.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('writes err.message when fn throws an Error and calls onError', async () => {
    const setters = makeSetters();
    const onError = vi.fn();
    const boom = new Error('kaboom');

    await runWithLoadingState(
      async () => { throw boom; },
      setters,
      { fallbackMessage: 'fb', onError },
    );

    expect(onError).toHaveBeenCalledWith(boom);
    expect(setters.setError).toHaveBeenCalledWith('kaboom');
    expect(setters.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('falls back to fallbackMessage when fn throws a non-Error', async () => {
    const setters = makeSetters();
    const onError = vi.fn();

    await runWithLoadingState(
      async () => { throw 'string-throw'; },
      setters,
      { fallbackMessage: 'pretty fallback', onError },
    );

    expect(onError).toHaveBeenCalledWith('string-throw');
    expect(setters.setError).toHaveBeenCalledWith('pretty fallback');
    expect(setters.setLoading).toHaveBeenLastCalledWith(false);
  });

  it('does not call onSuccess when fn throws', async () => {
    const setters = makeSetters();
    const onSuccess = vi.fn();

    await runWithLoadingState(
      async () => { throw new Error('x'); },
      setters,
      { fallbackMessage: 'fb', onError: () => {}, onSuccess },
    );

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('omitting onSuccess is allowed (multi-resource pattern: callback side-effects internally)', async () => {
    const setters = makeSetters();
    let sideEffected = false;

    await runWithLoadingState(
      async () => { sideEffected = true; },
      setters,
      { fallbackMessage: 'fb', onError: () => {} },
    );

    expect(sideEffected).toBe(true);
    expect(setters.setLoading).toHaveBeenLastCalledWith(false);
  });
});

describe('useResource', () => {
  it('starts in loading state with null data', () => {
    const loader = vi.fn().mockResolvedValue('payload');
    const { result } = renderHook(() => useResource(loader));

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('');
  });

  it('settles to data after loader resolves', async () => {
    const loader = vi.fn().mockResolvedValue({ items: [1, 2] });
    const { result } = renderHook(() => useResource(loader));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ items: [1, 2] });
    expect(result.current.error).toBe('');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('writes err.message and keeps data null on rejection', async () => {
    const onError = vi.fn();
    const loader = vi.fn().mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useResource(loader, { onError }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('network down');
    expect(result.current.data).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('uses fallbackMessage for non-Error throws', async () => {
    const loader = vi.fn().mockRejectedValue('boom');
    const { result } = renderHook(() =>
      useResource(loader, { fallbackMessage: 'no se pudo cargar', onError: () => {} }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('no se pudo cargar');
  });

  it('reload() re-runs the loader and clears prior error', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce('recovered');
    const { result } = renderHook(() => useResource(loader, { onError: () => {} }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('first fail');

    await act(async () => { await result.current.reload(); });

    expect(result.current.error).toBe('');
    expect(result.current.data).toBe('recovered');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('refetches when loader reference changes', async () => {
    const first = vi.fn().mockResolvedValue('A');
    const second = vi.fn().mockResolvedValue('B');
    const { result, rerender } = renderHook(({ loader }) => useResource(loader), {
      initialProps: { loader: first },
    });

    await waitFor(() => expect(result.current.data).toBe('A'));

    rerender({ loader: second });
    await waitFor(() => expect(result.current.data).toBe('B'));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('useAsyncEffect', () => {
  it('starts in loading state and runs fn once on mount', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useAsyncEffect(fn));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe('');
  });

  it('captures error from fn without owning data', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('orchestration failed'));
    const { result } = renderHook(() => useAsyncEffect(fn, { onError: () => {} }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('orchestration failed');
  });

  it('preserves side-effects done inside the callback (multi-resource pattern)', async () => {
    let pieces: { a?: number; b?: number } = {};
    const fn = vi.fn().mockImplementation(async () => {
      pieces = { a: 1, b: 2 };
    });
    const { result } = renderHook(() => useAsyncEffect(fn));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(pieces).toEqual({ a: 1, b: 2 });
  });

  it('run() re-fires the fn and clears prior error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('initial'))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useAsyncEffect(fn, { onError: () => {} }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('initial');

    await act(async () => { await result.current.run(); });

    expect(result.current.error).toBe('');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('re-runs when fn reference changes', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ fn }) => useAsyncEffect(fn), {
      initialProps: { fn: first },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({ fn: second });
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).toHaveBeenCalledTimes(1);
  });
});
