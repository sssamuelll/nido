import { showToast } from '../components/Toast';

export interface HandleApiErrorOptions {
  /**
   * When true, the error is logged but no toast is surfaced. Use for
   * declared background-tolerant fetches (Cat 3-auto in AGENTS.md):
   * mount loads, polls, optional sub-fetches, bootstrap. The user is not
   * waiting on this specific call, so a toast would be noise on UI they
   * are looking at for a different reason.
   */
  silent?: boolean;
}

/**
 * Single funnel for client-side API errors. Always logs to console.error
 * with the fallback as context. By default also surfaces a toast for the
 * user (Cat 2 / Cat 3-user-init in AGENTS.md). Pass `{ silent: true }`
 * for background fetches where the visible UI state already conveys
 * the failure.
 *
 * See AGENTS.md "Error handling taxonomy" for when each variant applies.
 */
export function handleApiError(
  err: unknown,
  fallback: string,
  opts: HandleApiErrorOptions = {},
): void {
  console.error(fallback, err);
  if (opts.silent) return;
  const msg = err instanceof Error && err.message ? err.message : fallback;
  showToast(msg, 'error');
}
