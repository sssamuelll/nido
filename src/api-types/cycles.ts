import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must match YYYY-MM-DD')
  .refine(v => {
    const ts = Date.parse(`${v}T00:00:00Z`);
    if (!Number.isFinite(ts)) return false;
    return new Date(ts).toISOString().slice(0, 10) === v;
  }, 'must be a real calendar date');

const cycleSchema = z
  .object({
    id: z.number().int().finite().positive(),
    month: z.string().min(1).max(64),
    status: z.enum(['pending', 'active']),
    start_date: dateOnlySchema.nullable(),
    end_date: dateOnlySchema.nullable(),
    started_at: z.string().min(1).nullable(),
  })
  .passthrough();

const MAX_CYCLES = 1000;

const cycleListSchema = z.array(cycleSchema).max(MAX_CYCLES);

export type CycleInfo = z.infer<typeof cycleSchema>;

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

export function parseCycleList(input: unknown): CycleInfo[] {
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
