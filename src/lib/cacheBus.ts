// PROHIBITED FEATURES — adding any of these means we should migrate to
// TanStack Query instead of extending this bus:
//   - In-flight request dedupe (multiple subscribers, single fetch)
//   - Retry / backoff
//   - Focus / reconnect refetch
//   - Optimistic updates
//   - Cache TTL / staleness / garbage collection
//
// Rule: if we find ourselves needing 2+ of these, the bus has lost its
// reason to exist. Migrate. Don't grow the bus into a half-TQ.
//
// The trajectory this bus protects: Nido is REST today but the planned
// pivot to local-first (Automerge / P2P sync) inverts the source of
// truth. A simple subscribe/invalidate seam is trivial to swap for a
// crdtBus that reacts to document changes; a TanStack Query setup is
// not. Keep the surface small.

/**
 * Canonical keys for cross-view cache invalidation. One level of
 * granularity per entity. Don't add per-id or per-cycle granularity
 * here — the price of refetching all subscribers of a key is low and
 * the simplicity protects against drift.
 *
 * If a real performance need ever forces id-level keys, add it as a
 * deliberate decision, not by accreting "expenses:byCycle:123" strings
 * across the codebase.
 */
export const CACHE_KEYS = {
  expenses: 'expenses',
  goals: 'goals',
  categories: 'categories',
  summary: 'summary',
  events: 'events',
  budget: 'budget',
  cycles: 'cycles',
  recurring: 'recurring',
  notifications: 'notifications',
} as const;

export type CacheKey = typeof CACHE_KEYS[keyof typeof CACHE_KEYS];

type Refetch = () => void;

const subscribers = new Map<CacheKey, Set<Refetch>>();

/**
 * Subscribe a refetch callback to a cache key. Returns an unsubscribe
 * function. Typical usage is from inside useResource / useAsyncEffect.
 */
function subscribe(key: CacheKey, refetch: Refetch): () => void {
  const set = subscribers.get(key) ?? new Set<Refetch>();
  set.add(refetch);
  subscribers.set(key, set);
  return () => {
    set.delete(refetch);
    if (set.size === 0) subscribers.delete(key);
  };
}

/**
 * Trigger every subscribed refetch for the given keys. Mutations call
 * this after a successful Api.* write — e.g. createExpense → invalidate
 * 'expenses', 'summary', 'categories'.
 */
function invalidate(...keys: CacheKey[]): void {
  for (const key of keys) {
    const set = subscribers.get(key);
    if (set) for (const refetch of set) refetch();
  }
}

export const cacheBus = { subscribe, invalidate };

// Test-only: exposed so tests can assert internal state without exporting
// the Map publicly. Production code should never import this.
export const __cacheBusInternals = {
  subscriberCount(key: CacheKey): number {
    return subscribers.get(key)?.size ?? 0;
  },
  reset(): void {
    subscribers.clear();
  },
};
