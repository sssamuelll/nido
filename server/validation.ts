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
  status: z.enum(['paid', 'pending']).optional().default('paid')
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
