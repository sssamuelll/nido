import { showToast } from '../components/Toast';

/**
 * Standard handler for an error from an Api.X call when the user is waiting
 * for feedback (button click, form submit, explicit action). Shows the
 * server's err.message if present, otherwise the provided fallback. Always
 * console.errors the fallback as context for debugging.
 *
 * For automatic loads (mount, polling, background refresh), do NOT use this —
 * just `console.error('contexto:', err)` and let Cat 4 (ErrorView state) cover
 * the case where the failure breaks the page.
 *
 * See AGENTS.md "Error handling taxonomy" for the broader pattern.
 */
export function handleApiError(err: unknown, fallback: string): void {
  console.error(fallback, err);
  const msg = err instanceof Error && err.message ? err.message : fallback;
  showToast(msg, 'error');
}
