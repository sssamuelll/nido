import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Database bootstrap', () => {
  let tempDir: string;
  let databasePath: string;
  let dbModule: typeof import('./db.js') | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nido-db-test-'));
    databasePath = path.join(tempDir, 'nido.test.db');
    vi.stubEnv('DATABASE_URL', databasePath);
  });

  afterEach(async () => {
    if (dbModule) {
      await dbModule.closeDatabase();
      dbModule = undefined;
    }

    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates the unified schema tables on a fresh database', async () => {
    dbModule = await import('./db.js');
    await dbModule.initDatabase();

    const database = dbModule.getDatabase();
    const tables = await database.all<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
    );
    const tableNames = tables.map((table) => table.name);

    expect(tableNames).toContain('households');
    expect(tableNames).toContain('app_users');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('household_budget');
    expect(tableNames).toContain('household_budget_approvals');
    expect(tableNames).toContain('household_budget_snapshots');
    expect(tableNames).toContain('category_budget_snapshots');

    const appUsers = await database.all<{
      username: string;
      household_slug: string;
      household_name: string;
      legacy_user_id: number;
    }[]>(
      `
        SELECT
          app_users.username,
          households.slug AS household_slug,
          households.name AS household_name,
          app_users.legacy_user_id
        FROM app_users
        JOIN households ON households.id = app_users.household_id
        ORDER BY app_users.username
      `
    );

    expect(appUsers).toEqual([
      {
        username: 'maria',
        household_slug: 'primary',
        household_name: 'Samuel & Maria',
        legacy_user_id: expect.any(Number),
      },
      {
        username: 'samuel',
        household_slug: 'primary',
        household_name: 'Samuel & Maria',
        legacy_user_id: expect.any(Number),
      },
    ]);

    // No categories seeded on a fresh db (users create their own)
    const categories = await database.all<{ name: string }[]>(
      `SELECT name FROM categories`
    );
    expect(categories).toEqual([]);
  });

  it('backfills expense user ids and creates category entries from legacy data', async () => {
    const currentMonth = new Date().toISOString().slice(0, 7);

    const legacyDatabase = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    await legacyDatabase.run(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await legacyDatabase.run(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        paid_by TEXT NOT NULL CHECK (paid_by IN ('samuel', 'maria')),
        type TEXT NOT NULL CHECK (type IN ('shared', 'personal')),
        status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await legacyDatabase.run(`
      CREATE TABLE category_budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        UNIQUE(month, category)
      )
    `);

    await legacyDatabase.run(
      `INSERT INTO users (username, password) VALUES ('samuel', 'legacy-hash'), ('maria', 'legacy-hash')`
    );
    await legacyDatabase.run(
      `
        INSERT INTO expenses (description, amount, category, date, paid_by, type, status)
        VALUES
          ('Rent split', 100, 'Gastos', ?, 'samuel', 'shared', 'paid'),
          ('Cinema', 45, 'Ocio', ?, 'maria', 'personal', 'paid')
      `,
      `${currentMonth}-05`,
      `${currentMonth}-10`
    );
    await legacyDatabase.close();

    dbModule = await import('./db.js');
    await dbModule.initDatabase();

    const database = dbModule.getDatabase();
    const expenseColumns = await database.all<{ name: string }[]>(`PRAGMA table_info(expenses)`);
    expect(expenseColumns.some((column) => column.name === 'paid_by_user_id')).toBe(true);

    const expenses = await database.all<{
      description: string;
      paid_by: string;
      paid_by_user_id: number | null;
      username: string | null;
    }[]>(
      `
        SELECT
          expenses.description,
          expenses.paid_by,
          expenses.paid_by_user_id,
          app_users.username
        FROM expenses
        LEFT JOIN app_users ON app_users.id = expenses.paid_by_user_id
        ORDER BY expenses.id
      `
    );

    expect(expenses).toEqual([
      {
        description: 'Rent split',
        paid_by: 'samuel',
        paid_by_user_id: expect.any(Number),
        username: 'samuel',
      },
      {
        description: 'Cinema',
        paid_by: 'maria',
        paid_by_user_id: expect.any(Number),
        username: 'maria',
      },
    ]);

    // The unified migration should have created category entries from expenses
    const categories = await database.all<{ name: string; context: string }[]>(
      `SELECT name, context FROM categories ORDER BY name, context`
    );
    // 'Gastos' from shared expense, 'Ocio' from personal expense
    expect(categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Gastos', context: 'shared' }),
        expect.objectContaining({ name: 'Ocio', context: 'personal' }),
      ])
    );
  });
});

describe('cycle_id migration', () => {
  let tempDir: string;
  let databasePath: string;
  let dbModule: typeof import('./db.js') | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'test');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nido-db-cycleid-'));
    databasePath = path.join(tempDir, 'nido.test.db');
    vi.stubEnv('DATABASE_URL', databasePath);
  });

  afterEach(async () => {
    if (dbModule) {
      await dbModule.closeDatabase();
      dbModule = undefined;
    }
    vi.unstubAllEnvs();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('adds cycle_id column to expenses table', async () => {
    dbModule = await import('./db.js');
    await dbModule.initDatabase();
    const db = dbModule.getDatabase();
    const cols = await db.all<{ name: string }[]>(`PRAGMA table_info(expenses)`);
    expect(cols.some(c => c.name === 'cycle_id')).toBe(true);
    const idx = await db.all<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='expenses'`
    );
    expect(idx.some(i => i.name === 'idx_expenses_cycle_id')).toBe(true);
  });
});
