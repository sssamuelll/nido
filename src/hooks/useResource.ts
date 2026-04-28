import { useCallback, useEffect, useRef, useState } from 'react';
import { handleApiError } from '../lib/handleApiError';

const DEFAULT_FALLBACK = 'Error al cargar';

export interface AsyncStateOptions {
  fallbackMessage?: string;
  onError?: (err: unknown) => void;
}

interface LoadingSetters {
  setLoading: (v: boolean) => void;
  setError: (v: string) => void;
}

interface RunOptions<T> {
  fallbackMessage: string;
  onError: (err: unknown) => void;
  onSuccess?: (value: T) => void;
}

/**
 * Shared loading/error skeleton for useResource and useAsyncEffect.
 * Sets loading→true and clears error before running fn. On success calls
 * onSuccess (if provided). On throw calls onError and writes a message into
 * the error setter (err.message if Error, fallbackMessage otherwise). Always
 * sets loading→false on the way out. Exported for direct testing and reuse.
 */
export async function runWithLoadingState<T>(
  fn: () => Promise<T>,
  setters: LoadingSetters,
  options: RunOptions<T>,
): Promise<void> {
  setters.setLoading(true);
  setters.setError('');
  try {
    const result = await fn();
    options.onSuccess?.(result);
  } catch (err) {
    options.onError(err);
    setters.setError(err instanceof Error ? err.message : options.fallbackMessage);
  } finally {
    setters.setLoading(false);
  }
}

// Holds the current options behind a ref so unstable inline values (e.g.
// `onError: () => {}`) don't change reload/run identity every render and
// trigger an infinite refetch loop. Only the loader/fn drives refetching.
//
// Default onError funnels through handleApiError with `silent: true` —
// these hooks model Cat 4 in AGENTS.md: the page-load failure is rendered
// via ErrorView (or equivalent), so a toast on top would be redundant.
// Callers can pass an explicit onError to override (e.g. for non-page
// resources that want a toast).
function useStableOptions(options: AsyncStateOptions) {
  const resolve = () => {
    const fallbackMessage = options.fallbackMessage ?? DEFAULT_FALLBACK;
    return {
      fallbackMessage,
      onError: options.onError ?? ((err: unknown) =>
        handleApiError(err, fallbackMessage, { silent: true })),
    };
  };
  const ref = useRef(resolve());
  ref.current = resolve();
  return ref;
}

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

/**
 * Single-resource fetch: loader returns one value, the hook stores it in `data`.
 * Use for views that load a single API resource (e.g. `Api.getGoals()` → goals list).
 * For loads that drive several state pieces in one shot, use {@link useAsyncEffect}.
 *
 * Caller must provide a stable loader (wrap in useCallback). The hook refetches
 * whenever the loader reference changes.
 */
export function useResource<T>(
  loader: () => Promise<T>,
  options: AsyncStateOptions = {},
): ResourceState<T> {
  const optsRef = useStableOptions(options);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    await runWithLoadingState(
      loader,
      { setLoading, setError },
      { ...optsRef.current, onSuccess: setData },
    );
  }, [loader, optsRef]);

  useEffect(() => { reload(); }, [reload]);

  return { data, loading, error, reload };
}

export interface AsyncEffectState {
  loading: boolean;
  error: string;
  run: () => Promise<void>;
}

/**
 * Multi-resource orchestration: callback does its own setX() calls for several
 * pieces of state. Use when a single load drives multiple bits of state
 * (e.g. Dashboard: summary + expenses + events + goals).
 * For single-resource fetches that return one value, prefer {@link useResource}.
 *
 * Caller must provide a stable fn (wrap in useCallback). The hook re-runs
 * whenever the fn reference changes.
 */
export function useAsyncEffect(
  fn: () => Promise<void>,
  options: AsyncStateOptions = {},
): AsyncEffectState {
  const optsRef = useStableOptions(options);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    await runWithLoadingState(
      fn,
      { setLoading, setError },
      optsRef.current,
    );
  }, [fn, optsRef]);

  useEffect(() => { run(); }, [run]);

  return { loading, error, run };
}
