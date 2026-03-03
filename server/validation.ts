import { z } from 'zod';

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
  category: z.enum(['Restaurant', 'Gastos', 'Servicios', 'Ocio', 'Inversión', 'Otros']),
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
  total_budget: z.coerce.number().positive('Total budget must be positive'),
  rent: z.coerce.number().nonnegative('Rent cannot be negative'),
  savings: z.coerce.number().nonnegative('Savings cannot be negative'),
  personal_samuel: z.coerce.number().nonnegative('Personal Samuel cannot be negative'),
  personal_maria: z.coerce.number().nonnegative('Personal Maria cannot be negative'),
  categories: z.record(z.string(), z.coerce.number().nonnegative()).optional()
}).refine(data => {
  // Ensure sum of components does not exceed total budget
  const sum = data.rent + data.savings + data.personal_samuel + data.personal_maria;
  return sum <= data.total_budget;
}, {
  message: 'Sum of rent, savings, and personal budgets cannot exceed total budget'
});

export const pinSchema = z.object({
  pin: z.string().length(4, 'El PIN debe tener 4 dígitos').regex(/^\d+$/, 'El PIN debe ser numérico'),
});

// Validation middleware factory
export function validate(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      if (schema === monthSchema) {
        const result = schema.safeParse(req.query.month);
        if (!result.success) {
          return res.status(400).json({ 
            error: 'Validation error', 
            details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
          });
        }
        (req as any).validatedMonth = result.data;
      } else {
        const result = schema.safeParse(req.body);
        if (!result.success) {
          return res.status(400).json({ 
            error: 'Validation error', 
            details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
          });
        }
        (req as any).validatedData = result.data;
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
