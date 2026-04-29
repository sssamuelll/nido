import { useCallback, useEffect, useRef, useState } from 'react';
import { handleApiError } from '../lib/handleApiError';
import { type CacheKey, cacheBus } from '../lib/cacheBus';

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
 * useResource subscribes to the cacheBus via either:
 *   - `invalidationKey: CacheKey`  — one source entity (Goals → 'goals'),
 *   - `invalidationKeys: CacheKey[]` — derived from several entities
 *      (EventDetail reads events + the expenses inside the event),
 *   - neither — no subscription.
 *
 * The discriminated union below makes "passing both at once" a compile-time
 * error rather than a silent runtime decision (which value wins, are they
 * merged, etc.). One callable knob per call site, enforced by tsc.
 */
export type ResourceOptions = AsyncStateOptions & (
  | { invalidationKey: CacheKey; invalidationKeys?: never }
  | { invalidationKey?: never; invalidationKeys: CacheKey[] }
  | { invalidationKey?: never; invalidationKeys?: never }
);

/**
 * Single-resource fetch: loader returns one value, the hook stores it in `data`.
 * Use for views that load a single API resource (e.g. `Api.getGoals()` → goals list).
 * For loads that drive several state pieces in one shot, use {@link useAsyncEffect}.
 *
 * Caller must provide a stable loader (wrap in useCallback). The hook refetches
 * whenever the loader reference changes, or when an invalidationKey is provided
 * and a mutation calls cacheBus.invalidate(key).
 */
export function useResource<T>(
  loader: () => Promise<T>,
  options: ResourceOptions = {},
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

  // Normalise singular + plural into one array internally — the discriminated
  // union guarantees at most one is set, so this is safe. Same ref+signature
  // trick as useAsyncEffect so a fresh array literal each render doesn't
  // churn subscriptions.
  const normalizedKeys = options.invalidationKey
    ? [options.invalidationKey]
    : options.invalidationKeys;
  const invalidationKeysRef = useRef(normalizedKeys);
  invalidationKeysRef.current = normalizedKeys;
  const invalidationKeysSignature = normalizedKeys?.join('|') ?? '';
  useEffect(() => {
    const keys = invalidationKeysRef.current;
    if (!keys || keys.length === 0) return;
    const unsubs = keys.map((key) =>
      cacheBus.subscribe(key, () => { void reload(); }),
    );
    return () => unsubs.forEach((u) => u());
  }, [invalidationKeysSignature, reload]);

  return { data, loading, error, reload };
}

export interface AsyncEffectState {
  loading: boolean;
  error: string;
  run: () => Promise<void>;
}

export interface AsyncEffectOptions extends AsyncStateOptions {
  /**
   * Subscribe this hook's run to cacheBus invalidations on each given key.
   * Multi-resource orchestration typically subscribes to several keys —
   * Dashboard re-runs when expenses, summary, categories, events, or goals
   * are invalidated upstream.
   */
  invalidationKeys?: CacheKey[];
}

/**
 * Multi-resource orchestration: callback does its own setX() calls for several
 * pieces of state. Use when a single load drives multiple bits of state
 * (e.g. Dashboard: summary + expenses + events + goals).
 * For single-resource fetches that return one value, prefer {@link useResource}.
 *
 * Caller must provide a stable fn (wrap in useCallback). The hook re-runs
 * whenever the fn reference changes, or when an invalidationKeys entry is
 * fired by cacheBus.invalidate(...).
 */
export function useAsyncEffect(
  fn: () => Promise<void>,
  options: AsyncEffectOptions = {},
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

  // Subscriptions track the *contents* of invalidationKeys, not the array
  // reference. Callers typically pass a fresh literal each render
  // (`[CACHE_KEYS.expenses, CACHE_KEYS.summary]`); using the array directly
  // as a dependency would re-subscribe every render. The string signature
  // captures content identity; the ref lets us read the latest array inside
  // the effect without listing it as a dependency. Refs are stable per
  // React's rules — no eslint disable needed.
  const invalidationKeysRef = useRef(options.invalidationKeys);
  invalidationKeysRef.current = options.invalidationKeys;
  const invalidationKeysSignature = options.invalidationKeys?.join('|') ?? '';
  useEffect(() => {
    const keys = invalidationKeysRef.current;
    if (!keys || keys.length === 0) return;
    const unsubs = keys.map((key) =>
      cacheBus.subscribe(key, () => { void run(); }),
    );
    return () => unsubs.forEach((u) => u());
  }, [invalidationKeysSignature, run]);

  return { loading, error, run };
}
