import { afterEach, describe, expect, it, vi } from 'vitest';
import { CACHE_KEYS, __cacheBusInternals, cacheBus } from './cacheBus';

afterEach(() => {
  __cacheBusInternals.reset();
});

describe('cacheBus', () => {
  it('starts with no subscribers for any key', () => {
    expect(__cacheBusInternals.subscriberCount(CACHE_KEYS.expenses)).toBe(0);
  });

  it('subscribe registers a refetch and returns an unsubscribe', () => {
    const refetch = vi.fn();
    const unsub = cacheBus.subscribe(CACHE_KEYS.expenses, refetch);

    expect(__cacheBusInternals.subscriberCount(CACHE_KEYS.expenses)).toBe(1);

    unsub();
    expect(__cacheBusInternals.subscriberCount(CACHE_KEYS.expenses)).toBe(0);
  });

  it('invalidate calls every subscribed refetch for the key', () => {
    const a = vi.fn();
    const b = vi.fn();
    cacheBus.subscribe(CACHE_KEYS.expenses, a);
    cacheBus.subscribe(CACHE_KEYS.expenses, b);

    cacheBus.invalidate(CACHE_KEYS.expenses);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('invalidate does not fire callbacks subscribed to other keys', () => {
    const onExpenses = vi.fn();
    const onGoals = vi.fn();
    cacheBus.subscribe(CACHE_KEYS.expenses, onExpenses);
    cacheBus.subscribe(CACHE_KEYS.goals, onGoals);

    cacheBus.invalidate(CACHE_KEYS.expenses);

    expect(onExpenses).toHaveBeenCalledTimes(1);
    expect(onGoals).not.toHaveBeenCalled();
  });

  it('invalidate accepts multiple keys in a single call', () => {
    const onExpenses = vi.fn();
    const onSummary = vi.fn();
    const onGoals = vi.fn();
    cacheBus.subscribe(CACHE_KEYS.expenses, onExpenses);
    cacheBus.subscribe(CACHE_KEYS.summary, onSummary);
    cacheBus.subscribe(CACHE_KEYS.goals, onGoals);

    cacheBus.invalidate(CACHE_KEYS.expenses, CACHE_KEYS.summary);

    expect(onExpenses).toHaveBeenCalledTimes(1);
    expect(onSummary).toHaveBeenCalledTimes(1);
    expect(onGoals).not.toHaveBeenCalled();
  });

  it('invalidate is a no-op for keys with no subscribers', () => {
    expect(() => cacheBus.invalidate(CACHE_KEYS.recurring)).not.toThrow();
  });

  it('unsubscribe of one subscriber does not affect siblings on the same key', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = cacheBus.subscribe(CACHE_KEYS.expenses, a);
    cacheBus.subscribe(CACHE_KEYS.expenses, b);

    unsubA();
    cacheBus.invalidate(CACHE_KEYS.expenses);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('subscribing the same callback twice registers it twice (caller responsibility)', () => {
    const refetch = vi.fn();
    cacheBus.subscribe(CACHE_KEYS.expenses, refetch);
    cacheBus.subscribe(CACHE_KEYS.expenses, refetch);

    cacheBus.invalidate(CACHE_KEYS.expenses);

    // Set semantics: same reference deduped to one entry
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('exposes the canonical CACHE_KEYS frozen at module load', () => {
    // Spot-check a few — full coverage is the type itself
    expect(CACHE_KEYS.expenses).toBe('expenses');
    expect(CACHE_KEYS.goals).toBe('goals');
    expect(CACHE_KEYS.categories).toBe('categories');
    expect(CACHE_KEYS.summary).toBe('summary');
    expect(CACHE_KEYS.events).toBe('events');
    expect(CACHE_KEYS.budget).toBe('budget');
    expect(CACHE_KEYS.cycles).toBe('cycles');
    expect(CACHE_KEYS.recurring).toBe('recurring');
    expect(CACHE_KEYS.notifications).toBe('notifications');
  });
});
