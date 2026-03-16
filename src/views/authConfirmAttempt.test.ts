import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateConfirmAttempt, resetConfirmAttemptsForTests } from './authConfirmAttempt';

describe('getOrCreateConfirmAttempt', () => {
  beforeEach(() => {
    resetConfirmAttemptsForTests();
  });

  it('reuses the same confirmation promise for the same token/type pair', async () => {
    const factory = vi.fn().mockResolvedValue(undefined);

    const first = getOrCreateConfirmAttempt('abc123', 'email', factory);
    const second = getOrCreateConfirmAttempt('abc123', 'email', factory);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);

    await expect(first).resolves.toBeUndefined();
  });

  it('creates separate attempts for different token/type pairs', () => {
    const factory = vi.fn().mockResolvedValue(undefined);

    const first = getOrCreateConfirmAttempt('abc123', 'email', factory);
    const second = getOrCreateConfirmAttempt('def456', 'email', factory);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });
});
