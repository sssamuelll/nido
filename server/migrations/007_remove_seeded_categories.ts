import type { Database } from 'sqlite';

export const name = 'remove_seeded_categories';

const SEEDED_NAMES = ['Restaurant', 'Gastos', 'Servicios', 'Ocio', 'Inversión', 'Otros'] as const;

/**
 * Removes the categories that older versions of db.ts auto-seeded for the
 * primary household. Users now create their own categories. Name kept as
 * "remove_seeded_categories" so prod's existing migrations row is matched.
 *
 * Note ordering: this runs BEFORE 008_unified_category_budget_model. On the
 * legacy-DB test, both 'Gastos' and 'Ocio' appear as expense categories but
 * the categories table is empty at this point, so this DELETE catches zero
 * rows. 008 then creates the categories from the expenses.
 */
export async function up(db: Database): Promise<void> {
  const household = await db.get<{ id: number }>(
    `SELECT id FROM households WHERE slug = 'primary'`
  );
  if (!household) return;

  await db.run(
    `DELETE FROM categories WHERE household_id = ? AND name IN (${SEEDED_NAMES.map(() => '?').join(',')})`,
    household.id,
    ...SEEDED_NAMES
  );
}

export async function down(_db: Database): Promise<void> {
  // The seeded categories are gone — re-creating them would be a fabrication.
  throw new Error('remove_seeded_categories is not rollback-safe (seed data is not preserved).');
}
