import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Common schemas
export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(val => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === val;
  }, 'Date must be a valid calendar date');

// Expense schemas
export const expenseCreateSchema = z.object({
  description: z.string().min(1, 'La descripcion es requerida').max(100),
  amount: z.coerce.number().positive('El monto debe ser un numero positivo'),
  category: z.string().min(1).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  date: dateSchema,
  type: z.enum(['shared', 'personal'], {
    errorMap: () => ({ message: 'El tipo debe ser shared o personal' })
  }),
  status: z.enum(['paid', 'pending']).optional().default('paid'),
  event_id: z.coerce.number().int().positive().optional(),
  cycle_id: z.coerce.number().int().positive().nullable().optional(),
}).refine(data => data.category || data.category_id, {
  message: 'category or category_id is required',
  path: ['category'],
});

// The test expects these to be identical for now
export const expenseUpdateSchema = expenseCreateSchema;

export const pinSchema = z.object({
  pin: z.string().length(4, 'El PIN debe tener 4 dígitos').regex(/^\d+$/, 'El PIN debe ser numérico'),
});

// Goal schemas
export const goalCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  icon: z.string().max(10).optional().default('🎯'),
  target: z.coerce.number().positive('El objetivo debe ser positivo'),
  start_date: z.string().max(50).optional(),
  deadline: z.string().max(50).optional(),
  owner_type: z.enum(['shared', 'personal']),
  owner_user_id: z.coerce.number().optional(),
});

export const goalUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(10).optional(),
  target: z.coerce.number().positive().optional(),
  start_date: z.string().max(50).optional().nullable(),
  deadline: z.string().max(50).optional().nullable(),
});

export const goalContributeSchema = z.object({
  amount: z.coerce.number().positive('El monto debe ser positivo'),
});

export type GoalInput = z.infer<typeof goalCreateSchema>;
export type GoalContributeInput = z.infer<typeof goalContributeSchema>;

// Validation middleware factory
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'Error de validación',
          details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
      (req as Request & { validatedData?: unknown }).validatedData = result.data;
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({ error: 'Error interno de validación' });
    }
  };
}

// Same as validate(), but parses req.query and stores the result on req.validatedQuery.
// Needed because Express types req.query.X as `string`, but at runtime it is
// `string | string[] | ParsedQs | ParsedQs[] | undefined` (qs parses ?a=x&a=y into an array,
// and ?a[b]=c into a nested object). The cast `as string` lies; a hostile or stale URL
// crashes downstream sqlite3 bindings or LIKE patterns.
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      if (!result.success) {
        return res.status(400).json({
          error: 'Error de validación',
          details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        });
      }
      (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
      next();
    } catch (error) {
      console.error('Query validation middleware error:', error);
      res.status(500).json({ error: 'Error interno de validación' });
    }
  };
}

export type ExpenseInput = z.infer<typeof expenseCreateSchema>;
export type PinInput = z.infer<typeof pinSchema>;
export const expenseSchema = expenseCreateSchema;

export const recurringExpenseCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  emoji: z.string().min(1).default('\uD83D\uDCC2'),
  amount: z.coerce.number().positive('El monto debe ser positivo'),
  category: z.string().min(1).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  type: z.enum(['shared', 'personal']),
  notes: z.string().max(200).optional(),
  every_n_cycles: z.coerce.number().int().min(1).default(1),
}).refine(data => data.category || data.category_id, {
  message: 'category or category_id is required',
  path: ['category'],
});

export const recurringExpenseUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  emoji: z.string().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  category: z.string().min(1).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  type: z.enum(['shared', 'personal']).optional(),
  notes: z.string().max(200).nullable().optional(),
  every_n_cycles: z.coerce.number().int().min(1).optional(),
});

export type RecurringExpenseInput = z.infer<typeof recurringExpenseCreateSchema>;
export type RecurringExpenseUpdateInput = z.infer<typeof recurringExpenseUpdateSchema>;

const noNullByte = (s: string) => !s.includes("\u0000");

const eventNameSchema = z.string().min(1).max(100).refine(noNullByte, 'name must not contain null bytes');
const eventEmojiSchema = z.string().min(1).max(20).refine(noNullByte, 'emoji must not contain null bytes');

const eventSubcategorySchema = z.object({
  name: eventNameSchema,
  emoji: eventEmojiSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB'),
});

const MAX_SUBCATEGORIES = 50;
const MAX_BUDGET_AMOUNT = 1_000_000_000;

export const eventCreateSchema = z.object({
  name: eventNameSchema,
  emoji: eventEmojiSchema.optional(),
  budget_amount: z.coerce.number().finite().nonnegative().max(MAX_BUDGET_AMOUNT).optional(),
  start_date: dateSchema,
  end_date: dateSchema,
  goal_id: z.coerce.number().int().positive().nullable().optional(),
  context: z.enum(['shared', 'personal']).default('shared'),
  subcategories: z.array(eventSubcategorySchema).max(MAX_SUBCATEGORIES).optional(),
}).refine(data => data.end_date >= data.start_date, {
  message: 'end_date must be on or after start_date',
  path: ['end_date'],
});

export const eventUpdateSchema = z.object({
  name: eventNameSchema.optional(),
  emoji: eventEmojiSchema.optional(),
  budget_amount: z.coerce.number().finite().nonnegative().max(MAX_BUDGET_AMOUNT).optional(),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  goal_id: z.coerce.number().int().positive().nullable().optional(),
  subcategories: z.array(eventSubcategorySchema).max(MAX_SUBCATEGORIES).optional(),
}).refine(
  data => data.start_date == null || data.end_date == null || data.end_date >= data.start_date,
  { message: 'end_date must be on or after start_date', path: ['end_date'] },
);

export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

// Query-string schemas for GET routes in expenses.ts. The handlers consume
// start_date / end_date / month / event_id / context that today are read as
// `req.query.X as string | undefined` — that cast is false: req.query values are
// `string | string[] | ParsedQs | ParsedQs[] | undefined`. These schemas turn the
// raw ParsedQs into typed values or 400 at the boundary.

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM');
const queryContextSchema = z.enum(['shared', 'personal']);
const queryEventIdSchema = z.coerce.number().finite().int().positive();

const startBeforeOrEqualEnd = (data: { start_date?: string; end_date?: string }) =>
  !data.start_date || !data.end_date || data.end_date >= data.start_date;
const startBeforeOrEqualEndError: { message: string; path: (string | number)[] } = {
  message: 'end_date must be on or after start_date',
  path: ['end_date'],
};

export const expenseListQuerySchema = z.object({
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  month: monthSchema.optional(),
  event_id: queryEventIdSchema.optional(),
  cycle_id: z.coerce.number().int().positive().optional(),
}).refine(startBeforeOrEqualEnd, startBeforeOrEqualEndError);

export const expenseSummaryQuerySchema = z.object({
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  month: monthSchema.optional(),
  cycle_id: z.coerce.number().int().positive().optional(),
}).refine(startBeforeOrEqualEnd, startBeforeOrEqualEndError);

export const expenseExportQuerySchema = z.object({
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
  context: queryContextSchema.optional(),
}).refine(startBeforeOrEqualEnd, startBeforeOrEqualEndError);

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
export type ExpenseSummaryQuery = z.infer<typeof expenseSummaryQuerySchema>;
export type ExpenseExportQuery = z.infer<typeof expenseExportQuerySchema>;

// GET /api/analytics is the dashboard's hot read. The handler used to do
// `req.query.context as string`, `req.query.start_date as string | undefined`,
// `req.query.end_date as string | undefined` — each cast is a lie because qs
// expands `?a=x&a=y` into an array and `?a[b]=c` into a nested object. The
// real failure modes were:
//   - context array → cast still passes, ternary defaults to 'shared' silently,
//     user that asked for personal sees shared spend.
//   - start_date object → bound directly to sqlite3, throws TypeError 30 frames
//     later inside db.js, surfaced as a contextless 500.
//   - start_date='foo' → SQL does WHERE date >= 'foo' (lexicographic, garbage
//     results), then `new Date('foo')` produces NaN that propagates through
//     periodDays / dailyRate / vsPrevPeriod and renders as €NaN in insights.
//   - end_date < start_date → 0 rows, negative periodDays, negative dailyRate.
// This schema rejects all four at the boundary, returns 400 with a `details`
// path, and yields a strong type the handler can trust by construction.
export const analyticsQuerySchema = z.object({
  context: queryContextSchema.default('shared'),
  start_date: dateSchema.optional(),
  end_date: dateSchema.optional(),
}).refine(startBeforeOrEqualEnd, startBeforeOrEqualEndError);

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

// Household budget mutation schemas.
//
// PUT /api/household/budget and POST /api/household/budget/approve previously
// destructured req.body without any schema. total_amount / personal_budget
// reached SQLite UPDATE/INSERT bindings as whatever shape the client sent
// (string "100", NaN, Infinity, negative, object, undefined). Numeric columns
// with NUMERIC affinity coerce silently and persist garbage that later reads
// (server/routes/expenses.ts:379) propagate as NaN/null into the dashboards
// of every household member. These schemas reject those inputs at the boundary.
const MAX_HOUSEHOLD_BUDGET = 1_000_000_000;

export const householdBudgetUpdateSchema = z.object({
  total_amount: z.number().finite().nonnegative().max(MAX_HOUSEHOLD_BUDGET).optional(),
  personal_budget: z.number().finite().nonnegative().max(MAX_HOUSEHOLD_BUDGET).optional(),
}).strict().refine(
  data => data.total_amount !== undefined || data.personal_budget !== undefined,
  { message: 'total_amount or personal_budget is required', path: ['total_amount'] },
);

export const householdBudgetApproveSchema = z.object({
  approval_id: z.number().finite().int().positive(),
}).strict();

export type HouseholdBudgetUpdateInput = z.infer<typeof householdBudgetUpdateSchema>;
export type HouseholdBudgetApproveInput = z.infer<typeof householdBudgetApproveSchema>;

// POST /api/categories — until this PR the route in server/index.ts destructured
// req.body without a schema. typeof NaN === 'number' let NaN slip past the
// `typeof === 'number'` guard into INSERT INTO categories(budget_amount, ...);
// SQLite REAL accepted it and every later SUM(budget_amount) returned NaN,
// permanently breaking the overflow validation for the household. The schema
// rejects NaN/Infinity/strings/over-cap at the boundary with a structured 400.
const categoryNameSchema = z.string().min(1).max(100).refine(noNullByte, 'name must not contain null bytes');
const categoryEmojiSchema = z.string().min(1).max(20).refine(noNullByte, 'emoji must not contain null bytes');
const categoryColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB');

export const categoryUpsertSchema = z.object({
  id: z.number().finite().int().positive().optional(),
  name: categoryNameSchema,
  emoji: categoryEmojiSchema,
  color: categoryColorSchema,
  budget_amount: z.number().finite().nonnegative().max(MAX_BUDGET_AMOUNT).optional(),
  context: z.enum(['shared', 'personal']).optional(),
}).strict();

export type CategoryUpsertInput = z.infer<typeof categoryUpsertSchema>;

// POST /api/cycles/approve — sibling of POST /api/household/budget/approve
// (commit 55c3422). Same shape, same risk: a missing schema let an object
// or array reach sqlite3 binding and surface a contextless 500 thirty
// frames later. .strict() rejects typos like `cycleId`.
export const cycleApproveSchema = z.object({
  cycle_id: z.number().finite().int().positive(),
}).strict();

export type CycleApproveInput = z.infer<typeof cycleApproveSchema>;

// POST /auth/invite — relink_user_id is optional but, when present, must be
// a positive int. The legacy `if (!relink_user_id)` falsy guard treated 0
// as "no relink" and silently created a fresh-device invitation; objects
// crashed the lookup with TypeError surfaced as 500. .positive() rules out
// the 0 drift; .strict() catches typos like `relinkUserId`.
export const inviteCreateSchema = z.object({
  relink_user_id: z.number().finite().int().positive().optional(),
}).strict();

export type InviteCreateInput = z.infer<typeof inviteCreateSchema>;
