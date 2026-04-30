import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must match YYYY-MM-DD')
  .refine(v => {
    const ts = Date.parse(`${v}T00:00:00Z`);
    if (!Number.isFinite(ts)) return false;
    return new Date(ts).toISOString().slice(0, 10) === v;
  }, 'must be a real calendar date');

// /api/cycles/list returns a minimal projection — no approval state, no
// requested_by, no JOINs. Used by views that show a cycle picker or
// resolve a date against the cycle history.
const cycleSummarySchema = z
  .object({
    id: z.number().int().finite().positive(),
    month: z.string().min(1).max(64),
    status: z.enum(['pending', 'active']),
    start_date: dateOnlySchema.nullable(),
    end_date: dateOnlySchema.nullable(),
    started_at: z.string().min(1).nullable(),
  })
  .passthrough();

// /api/cycles/{current,request,approve} go through getCycleWithApprovalState
// on the server and always include requester identity + approvals state.
// Modeled as a strict superset of the summary so consumers that only need
// summary fields can keep using CycleSummary types.
const cycleDetailSchema = cycleSummarySchema
  .extend({
    requested_by_user_id: z.number().int().finite().positive(),
    requested_by_username: z.string().nullable(),
    approved_by_user_id: z.number().int().finite().positive().nullable(),
    approvals: z.object({
      total_members: z.number().int().nonnegative(),
      approved_count: z.number().int().nonnegative(),
      approved_user_ids: z.array(z.number().int().positive()),
      current_user_has_approved: z.boolean(),
      all_approved: z.boolean(),
    }),
  })
  .passthrough();

const MAX_CYCLES = 1000;

const cycleListSchema = z.array(cycleSummarySchema).max(MAX_CYCLES);

export type CycleSummary = z.infer<typeof cycleSummarySchema>;
export type CycleDetail = z.infer<typeof cycleDetailSchema>;

/** Legacy alias for CycleSummary; prefer CycleSummary directly in new code. */
export type CycleInfo = CycleSummary;

export class CycleParseError extends Error {
  readonly path: ReadonlyArray<string | number>;
  readonly receivedKind: string;

  constructor(message: string, path: ReadonlyArray<string | number>, receivedKind: string) {
    super(message);
    this.name = 'CycleParseError';
    this.path = path;
    this.receivedKind = receivedKind;
  }
}

const describeKind = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(len=${v.length})`;
  return typeof v;
};

export function parseCycleList(input: unknown): CycleSummary[] {
  const result = cycleListSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const pathStr = issue.path.length === 0 ? '<root>' : issue.path.join('.');
  const err = new CycleParseError(
    `cycle list parse failed at ${pathStr}: ${issue.message}`,
    issue.path,
    describeKind(input),
  );
  console.warn('[api] cycle list parse failed', {
    path: err.path,
    receivedKind: err.receivedKind,
    issue: issue.message,
  });
  throw err;
}

export function parseCycleDetail(input: unknown): CycleDetail {
  const result = cycleDetailSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const pathStr = issue.path.length === 0 ? '<root>' : issue.path.join('.');
  const err = new CycleParseError(
    `cycle detail parse failed at ${pathStr}: ${issue.message}`,
    issue.path,
    describeKind(input),
  );
  console.warn('[api] cycle detail parse failed', {
    path: err.path,
    receivedKind: err.receivedKind,
    issue: issue.message,
  });
  throw err;
}
