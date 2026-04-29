import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must match YYYY-MM-DD')
  .refine(v => {
    const ts = Date.parse(`${v}T00:00:00Z`);
    if (!Number.isFinite(ts)) return false;
    return new Date(ts).toISOString().slice(0, 10) === v;
  }, 'must be a real calendar date');

const expenseSchema = z
  .object({
    id: z.number().int().finite().positive(),
    description: z.string().max(500),
    amount: z.number().finite(),
    category: z.string().max(100),
    category_id: z.number().int().finite().positive().nullable().optional(),
    date: dateOnlySchema,
    type: z.enum(['shared', 'personal']),
    status: z.enum(['paid', 'pending']).optional(),
    paid_by: z.string().max(100),
    paid_by_user_id: z.number().int().finite().positive().nullable().optional(),
    created_at: z.string().min(1).optional(),
    event_id: z.number().int().finite().positive().nullable().optional(),
    cycle_id: z.number().int().finite().positive().nullable().optional(),
  })
  .passthrough();

const MAX_EXPENSES = 5000;

const expenseListSchema = z.array(expenseSchema).max(MAX_EXPENSES);

export type Expense = z.infer<typeof expenseSchema>;

export class ExpenseParseError extends Error {
  readonly path: ReadonlyArray<string | number>;
  readonly receivedKind: string;

  constructor(message: string, path: ReadonlyArray<string | number>, receivedKind: string) {
    super(message);
    this.name = 'ExpenseParseError';
    this.path = path;
    this.receivedKind = receivedKind;
  }
}

const describeKind = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(len=${v.length})`;
  return typeof v;
};

export function parseExpenseList(input: unknown): Expense[] {
  const result = expenseListSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const pathStr = issue.path.length === 0 ? '<root>' : issue.path.join('.');
  const err = new ExpenseParseError(
    `expense list parse failed at ${pathStr}: ${issue.message}`,
    issue.path,
    describeKind(input),
  );
  console.warn('[api] expense list parse failed', {
    path: err.path,
    receivedKind: err.receivedKind,
    issue: issue.message,
  });
  throw err;
}
