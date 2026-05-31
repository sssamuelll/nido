/**
 * server/seed-dev.ts — Datos de demo para revisar la UI del rediseño.
 *
 * Reproduce el dataset del prototipo del diseñador (pareja en Alemania:
 * Edeka, dm, Lidl, alquiler…) sobre el esquema real, con `paid_by` real
 * por gasto (decisión de producto: el Historial muestra quién pagó, no 50/50).
 *
 * Idempotente: borra solo los datos de demo (gastos, categorías, objetivos,
 * aportes) y vuelve a sembrarlos. NO toca household / users / passkeys / sesiones.
 *
 *   npm run seed:dev
 *
 * Login local: usuario `samuel` o `maria`, PIN 1234 (PIN semilla de dev).
 * "Tú" en el prototipo = Samuel; "María" = María. Entra como `samuel`
 * para que la columna "Tú" del Historial calce con el diseño.
 */
import { initDatabase, getDatabase } from './db.js';
import { logger } from './logger.js';

type Ctx = 'shared' | 'personal';

interface SeedCategory {
  name: string;
  emoji: string;
  color: string;
  budget: number;
}

// Categorías compartidas — colores tomados de los tokens nido (clay/pine/honey/plum/berry/ink-2).
const SHARED_CATEGORIES: SeedCategory[] = [
  { name: 'Vivienda', emoji: '🏠', color: '#9E4B43', budget: 350 },
  { name: 'Restauración', emoji: '🍽️', color: '#BC5739', budget: 400 },
  { name: 'Supermercado', emoji: '🛒', color: '#3D6B52', budget: 350 },
  { name: 'Ocio', emoji: '🎬', color: '#C0852B', budget: 200 },
  { name: 'Viajes', emoji: '✈️', color: '#6C5A86', budget: 200 },
  { name: 'Bienestar', emoji: '🧴', color: '#6A6155', budget: 125 },
];

// [fecha YYYY-MM-DD, descripción, categoría, pagador, importe]
type ExpenseTuple = [string, string, string, 'Tú' | 'María', number];

// Ciclo actual (mayo 2026) — fechas reales: 25 may 2026 es lunes, calza con el prototipo.
const EXPENSES: ExpenseTuple[] = [
  ['2026-05-25', 'Mein Wohnzimmer', 'Restauración', 'María', 29.9],
  ['2026-05-25', 'Fuerthermare', 'Ocio', 'María', 76.0],
  ['2026-05-25', 'Edeka Fürth', 'Supermercado', 'Tú', 43.49],
  ['2026-05-25', 'dm Drogerie', 'Bienestar', 'Tú', 10.21],
  ['2026-05-24', 'Sabor Colombiano', 'Restauración', 'María', 16.0],
  ['2026-05-24', 'Kiosco Glemser', 'Supermercado', 'María', 5.0],
  ['2026-05-24', '7 Days Fresh', 'Restauración', 'Tú', 18.0],
  ['2026-05-24', 'Müller', 'Bienestar', 'Tú', 39.0],
  ['2026-05-23', 'Vinoteca Alonso', 'Restauración', 'María', 63.99],
  ['2026-05-23', 'Almacén Adidas', 'Ocio', 'Tú', 30.0],
  ['2026-05-23', 'Food Kultur', 'Restauración', 'Tú', 28.51],
  ['2026-05-22', 'Alquiler · piso', 'Vivienda', 'Tú', 335.0],
  ['2026-05-22', 'Lidl', 'Supermercado', 'María', 52.3],
  ['2026-05-22', 'Cine Cinemark', 'Ocio', 'María', 24.0],
  ['2026-05-21', 'Renfe · billetes', 'Viajes', 'María', 89.4],
  ['2026-05-21', 'Farmacia Sur', 'Bienestar', 'Tú', 12.8],
  ['2026-05-21', 'Tigella Bella', 'Restauración', 'Tú', 41.2],
  // Abril 2026
  ['2026-04-26', 'La Trattoria', 'Restauración', 'María', 34.5],
  ['2026-04-26', 'Rewe', 'Supermercado', 'Tú', 38.2],
  ['2026-04-26', 'Kino Babylon', 'Ocio', 'María', 22.0],
  ['2026-04-24', 'Apotheke', 'Bienestar', 'Tú', 15.6],
  ['2026-04-24', 'Bäckerei Sommer', 'Restauración', 'María', 9.8],
  ['2026-04-21', 'Alquiler · piso', 'Vivienda', 'Tú', 335.0],
  ['2026-04-21', 'Vapiano', 'Restauración', 'Tú', 41.9],
  ['2026-04-19', 'Edeka', 'Supermercado', 'María', 56.4],
  ['2026-04-19', 'H&M', 'Ocio', 'María', 48.0],
  ['2026-04-19', 'Bar Centrale', 'Restauración', 'Tú', 27.3],
  ['2026-04-15', 'Deutsche Bahn', 'Viajes', 'Tú', 74.0],
  ['2026-04-15', 'dm Drogerie', 'Bienestar', 'María', 12.4],
  ['2026-04-15', 'Asia Imbiss', 'Restauración', 'Tú', 18.5],
  // Marzo 2026
  ['2026-03-23', 'Osteria', 'Restauración', 'María', 52.0],
  ['2026-03-23', 'Lidl', 'Supermercado', 'Tú', 44.1],
  ['2026-03-21', 'Theater', 'Ocio', 'María', 60.0],
  ['2026-03-19', 'Apotheke', 'Bienestar', 'Tú', 9.9],
  ['2026-03-17', 'Alquiler · piso', 'Vivienda', 'Tú', 335.0],
  ['2026-03-17', 'Curry 36', 'Restauración', 'María', 14.5],
  ['2026-03-15', 'Rewe', 'Supermercado', 'María', 61.2],
  ['2026-03-15', 'Decathlon', 'Ocio', 'Tú', 39.99],
  ['2026-03-15', 'Sushi Bar', 'Restauración', 'Tú', 46.8],
  ['2026-03-13', 'Flixbus', 'Viajes', 'María', 29.0],
  ['2026-03-13', 'Müller', 'Bienestar', 'Tú', 23.1],
  ['2026-03-11', 'Bäckerei', 'Restauración', 'María', 8.2],
  ['2026-03-11', 'Edeka', 'Supermercado', 'Tú', 33.7],
];

interface SeedGoal {
  name: string;
  icon: string;
  target: number;
  current: number;
  start_date: string;
  deadline: string;
  contributor: 'samuel' | 'maria' | null;
}

const GOALS: SeedGoal[] = [
  { name: 'Viaje a Berlín en mayo', icon: '✈️', target: 600, current: 420, start_date: '2026-04-23', deadline: '2026-05-10', contributor: 'samuel' },
  { name: 'Viaje a Venezuela', icon: '✈️', target: 3500, current: 720, start_date: '2026-04-15', deadline: '2026-11-15', contributor: 'maria' },
];

const HOUSEHOLD_BUDGET = { total: 1625, personalSamuel: 400, personalMaria: 400 };

async function main(): Promise<void> {
  // HARD GUARD: this script DELETES all expenses/categories/goals of the first
  // household. It must NEVER run against production data. It is excluded from
  // the production build (server/tsconfig.json) and never imported by the
  // server, but this refuses to run if it ever lands somewhere with a prod env.
  if (process.env.NODE_ENV === 'production' || process.env.NIDO_ENV === 'production') {
    // eslint-disable-next-line no-console
    console.error('seed-dev: REHUSADO — este script borra datos de demo y jamás debe correr en producción.');
    process.exit(1);
  }

  await initDatabase();
  const db = getDatabase();

  const household = await db.get<{ id: number }>(`SELECT id FROM households ORDER BY id LIMIT 1`);
  if (!household) throw new Error('No hay household. Arranca el server una vez para correr las migraciones de seed.');
  const hhId = household.id;

  const appUsers = await db.all<{ id: number; username: string }[]>(
    `SELECT id, username FROM app_users WHERE household_id = ?`,
    hhId
  );
  const userId = (username: string): number => {
    const u = appUsers.find((x) => x.username === username);
    if (!u) throw new Error(`app_user "${username}" no existe. ¿Corrieron las migraciones 002/003?`);
    return u.id;
  };
  const samuelId = userId('samuel');
  const mariaId = userId('maria');
  const payerToUser = (p: 'Tú' | 'María') => (p === 'María' ? { name: 'maria', id: mariaId } : { name: 'samuel', id: samuelId });

  // --- Limpieza idempotente (solo datos de demo) ---
  await db.run(`DELETE FROM goal_contributions`);
  await db.run(`DELETE FROM goals WHERE household_id = ?`, hhId);
  await db.run(`DELETE FROM expenses`);
  await db.run(`DELETE FROM categories WHERE household_id = ?`, hhId);

  // --- Presupuesto del hogar ---
  await db.run(
    `INSERT INTO household_budget (household_id, total_amount, personal_samuel, personal_maria, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(household_id) DO UPDATE SET
       total_amount = excluded.total_amount,
       personal_samuel = excluded.personal_samuel,
       personal_maria = excluded.personal_maria,
       updated_at = CURRENT_TIMESTAMP`,
    hhId, HOUSEHOLD_BUDGET.total, HOUSEHOLD_BUDGET.personalSamuel, HOUSEHOLD_BUDGET.personalMaria
  );

  // --- Categorías compartidas ---
  const categoryId = new Map<string, number>();
  for (const c of SHARED_CATEGORIES) {
    const r = await db.run(
      `INSERT INTO categories (household_id, name, emoji, color, budget_amount, context, owner_user_id)
       VALUES (?, ?, ?, ?, ?, 'shared', NULL)`,
      hhId, c.name, c.emoji, c.color, c.budget
    );
    categoryId.set(c.name, r.lastID as number);
  }

  // --- Gastos (todos compartidos, con paid_by real) ---
  for (const [date, description, category, payer, amount] of EXPENSES) {
    const u = payerToUser(payer);
    await db.run(
      `INSERT INTO expenses (description, amount, category, category_id, date, paid_by, paid_by_user_id, type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'shared', 'paid')`,
      description, amount, category, categoryId.get(category) ?? null, date, u.name, u.id
    );
  }

  // --- Objetivos compartidos ---
  for (const g of GOALS) {
    const r = await db.run(
      `INSERT INTO goals (household_id, name, icon, target, current, deadline, start_date, owner_type, owner_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'shared', NULL)`,
      hhId, g.name, g.icon, g.target, g.current, g.deadline, g.start_date
    );
    if (g.current > 0 && g.contributor) {
      await db.run(
        `INSERT INTO goal_contributions (goal_id, app_user_id, amount) VALUES (?, ?, ?)`,
        r.lastID, g.contributor === 'maria' ? mariaId : samuelId, g.current
      );
    }
  }

  const totals = await db.get<{ exp: number; cat: number; goals: number }>(
    `SELECT (SELECT COUNT(*) FROM expenses) AS exp,
            (SELECT COUNT(*) FROM categories WHERE household_id = ${hhId}) AS cat,
            (SELECT COUNT(*) FROM goals WHERE household_id = ${hhId}) AS goals`
  );
  logger.info(
    { household: hhId, ...totals, budget: HOUSEHOLD_BUDGET.total },
    'seed-dev: datos de demo sembrados'
  );
  // eslint-disable-next-line no-console
  console.log(
    `\n✓ Seed listo · household ${hhId} · ${totals?.exp} gastos · ${totals?.cat} categorías · ${totals?.goals} objetivos` +
      `\n  Entra en http://localhost:5173 como "samuel" (o "maria"), PIN 1234.\n`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('seed-dev falló:', err);
    process.exit(1);
  });
