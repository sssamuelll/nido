import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Common schemas
export const monthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format')
  .refine(val => {
    const [year, month] = val.split('-').map(Number);
    return month >= 1 && month <= 12;
  }, 'Month must be between 01 and 12');

export const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(val => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === val;
  }, 'Date must be a valid calendar date');

// Expense schemas
export const expenseCreateSchema = z.object({
  description: z.string().min(1, 'La descripción es requerida').max(100),
  amount: z.coerce.number().positive('El monto debe ser un número positivo'),
  category: z.string().min(1, 'La categoría es requerida'),
  date: dateSchema,
  paid_by: z.enum(['samuel', 'maria']),
  type: z.enum(['shared', 'personal'], {
    errorMap: () => ({ message: 'El tipo debe ser shared o personal' })
  }),
  status: z.enum(['paid', 'pending']).optional().default('paid')
});

// The test expects these to be identical for now
export const expenseUpdateSchema = expenseCreateSchema;

// Budget schemas
export const budgetUpdateSchema = z.object({
  month: monthSchema,
  shared_available: z.coerce.number().nonnegative('Shared available cannot be negative').optional(),
  personal_budget: z.coerce.number().nonnegative('Personal budget cannot be negative').optional(),
  personal_samuel: z.coerce.number().nonnegative('Personal Samuel cannot be negative').optional(),
  personal_maria: z.coerce.number().nonnegative('Personal Maria cannot be negative').optional(),
  categories: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
  context: z.enum(['shared', 'personal']).optional()
});

export const pinSchema = z.object({
  pin: z.string().length(4, 'El PIN debe tener 4 dígitos').regex(/^\d+$/, 'El PIN debe ser numérico'),
});

// Goal schemas
export const goalCreateSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(100),
  icon: z.string().max(10).optional().default('🎯'),
  target: z.coerce.number().positive('El objetivo debe ser positivo'),
  deadline: z.string().max(50).optional(),
  owner_type: z.enum(['shared', 'personal']),
  owner_user_id: z.coerce.number().optional(),
});

export const goalUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(10).optional(),
  target: z.coerce.number().positive().optional(),
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
      if (schema === monthSchema) {
        const result = schema.safeParse(req.query.month);
        if (!result.success) {
          return res.status(400).json({
            error: 'Validation error',
            details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
          });
        }
        (req as Request & { validatedMonth?: string }).validatedMonth = result.data as string;
      } else {
        const result = schema.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({
            error: 'Validation error',
            details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
          });
        }
        (req as Request & { validatedData?: unknown }).validatedData = result.data;
      }
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({ error: 'Internal validation error' });
    }
  };
}

export const validateMonthParam = validate(monthSchema);

export type ExpenseInput = z.infer<typeof expenseCreateSchema>;
export type BudgetInput = z.infer<typeof budgetUpdateSchema>;
export type PinInput = z.infer<typeof pinSchema>;
export const expenseSchema = expenseCreateSchema; 
export const budgetSchema = budgetUpdateSchema;   
