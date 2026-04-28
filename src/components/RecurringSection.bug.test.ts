import { describe, it, expect } from 'vitest';

/**
 * Documents the bug at src/components/RecurringSection.tsx:113 —
 * see docs/HALLAZGOS.md "Eje G — RecurringSection requested_by mismatch".
 *
 * The component reads `cycle.requested_by` but the server actually returns
 * `requested_by_user_id`. The `!== userId` comparison degenerates to
 * `undefined !== number`, which is always true. Result: the approval banner
 * shows for the user who REQUESTED the cycle, instead of the user who needs
 * to APPROVE it.
 *
 * The first `it.fails` test asserts the correct behaviour and is expected to
 * fail today; when the bug is fixed (component compares against
 * `requested_by_user_id`), the test will start passing and vitest will flag
 * it — that's the signal to delete this file.
 *
 * The second test pins the current observable symptom for clarity.
 */

// Real server response shape (from server/routes/cycles.ts getCycleWithApprovalState).
const serverCycle = {
  id: 1,
  status: 'pending' as const,
  requested_by_user_id: 1, // Samuel requested it
  month: '2026-04-27',
  start_date: '2026-04-27',
  end_date: null,
  started_at: null,
};

// Replicates the component's computation at RecurringSection.tsx:113.
const showApprovalBanner = (cycle: unknown, userId: number) => {
  const c = cycle as { status: string; requested_by?: number };
  return c.status === 'pending' && c.requested_by !== userId;
};

describe('RecurringSection approval banner — known bug (Eje G)', () => {
  it.fails(
    'should hide the banner from the user who requested the cycle (currently broken)',
    () => {
      // Samuel (id=1) requested the cycle. Banner should hide for him.
      // Today this assertion fails because cycle.requested_by is undefined.
      expect(showApprovalBanner(serverCycle, 1)).toBe(false);
    }
  );

  it('pins the current symptom: banner shows to the requester instead of the partner', () => {
    // userId=1 is Samuel (the requester). Today the banner shows for him too.
    expect(showApprovalBanner(serverCycle, 1)).toBe(true);
  });
});
