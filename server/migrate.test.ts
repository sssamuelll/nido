import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sqlite3 from 'sqlite3';
import type { Database } from 'sqlite';
import { open } from 'sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getStatus,
  rollbackLast,
  runPendingMigrations,
  type Migration,
} from './migrate.js';
import * as m003 from './migrations/003_sync_app_users_from_legacy.js';
import * as m011 from './migrations/011_categories_drop_legacy_unique.js';

const openTempDb = async (): Promise<{ db: Database; dbPath: string; cleanup: () => Promise<void> }> => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nido-migrate-test-'));
  const dbPath = path.join(tempDir, 'nido.test.db');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');
  return {
    db,
    dbPath,
    cleanup: async () => {
      try {
        await db.close();
      } catch {
        /* already closed */
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
};

const tableExists = async (db: Database, name: string): Promise<boolean> => {
  const row = await db.get<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    name
  );
  return !!row;
};

describe('migrate runner — real migrations', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('applies every migration on a fresh DB and is a no-op on the second pass', async () => {
    const { db, cleanup } = await openTempDb();
    try {
      const first = await runPendingMigrations(db);
      expect(first.applied.length).toBeGreaterThan(0);
      expect(first.shadowRegistered).toEqual([]);
      // Core tables exist after migrations
      for (const t of ['users', 'expenses', 'sessions', 'app_users', 'households', 'categories', 'household_budget']) {
        expect(await tableExists(db, t)).toBe(true);
      }
      // All migration names recorded
      const rows = await db.all<{ name: string }[]>(`SELECT name FROM migrations`);
      expect(rows.length).toBe(first.applied.length);

      const second = await runPendingMigrations(db);
      expect(second.applied).toEqual([]);
      expect(second.shadowRegistered).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('shadow-registers schema migrations against a pre-versioned DB', async () => {
    // First, fully migrate a fresh DB so the schema is in place.
    const { db, cleanup } = await openTempDb();
    try {
      await runPendingMigrations(db);

      // Now simulate a "pre-versioned prod" state: drop the schema-migration rows
      // and replace them with only the named legacy migrations that prod has.
      await db.run(`DELETE FROM migrations`);
      const legacyNames = [
        'remove_seeded_categories',
        'unified_category_budget_model',
        'goals_start_date',
        'recurring_cycle_frequency',
        'categories_drop_legacy_unique',
        'recurring_materialize_legacy',
        'expenses_add_cycle_id',
        'backfill_expense_category_ids',
      ];
      for (const name of legacyNames) {
        await db.run(`INSERT INTO migrations (name, applied_at) VALUES (?, CURRENT_TIMESTAMP)`, name);
      }
      // drop_users_password is intentionally absent — that matches the actual
      // dev DB observation and confirms a not-yet-applied migration still runs.

      const result = await runPendingMigrations(db);

      expect(result.shadowRegistered).toEqual(
        expect.arrayContaining(['001_initial_schema', '002_seed_primary_household'])
      );
      // The shadow rows are written with the bootstrap timestamp
      const shadow = await db.all<{ name: string; applied_at: string }[]>(
        `SELECT name, applied_at FROM migrations WHERE name LIKE '00%_%'`
      );
      const shadowMap = new Map(shadow.map((r) => [r.name, r.applied_at]));
      expect(shadowMap.get('001_initial_schema')).toBe('1970-01-01 00:00:00');
      expect(shadowMap.get('002_seed_primary_household')).toBe('1970-01-01 00:00:00');

      // Only the not-yet-applied data migrations + drop_users_password should be in result.applied
      expect(result.applied).toEqual(
        expect.arrayContaining([
          '003_sync_app_users_from_legacy',
          '004_backfill_expense_paid_by_user_id',
          '005_hash_plaintext_pins',
          'drop_users_password',
        ])
      );
      // The migrations that were already in the legacy table must NOT re-run
      expect(result.applied).not.toContain('unified_category_budget_model');
      expect(result.applied).not.toContain('remove_seeded_categories');
    } finally {
      await cleanup();
    }
  });

  it('does not shadow-register on a fresh DB with missing tables', async () => {
    const { db, cleanup } = await openTempDb();
    try {
      const result = await runPendingMigrations(db);
      expect(result.shadowRegistered).toEqual([]);
      expect(result.applied).toContain('001_initial_schema');
    } finally {
      await cleanup();
    }
  });

  it('getStatus marks shadow rows distinctly from real applies and ignores 1970-stamped non-schema rows', async () => {
    const { db, cleanup } = await openTempDb();
    try {
      await runPendingMigrations(db);
      // Promote 001 to shadow by re-stamping its applied_at — eligible because
      // it's in SCHEMA_MIGRATION_NAMES.
      await db.run(
        `UPDATE migrations SET applied_at = '1970-01-01 00:00:00' WHERE name = '001_initial_schema'`
      );
      // Also re-stamp a non-schema migration with the same sentinel — should
      // NOT be classified as shadow (defense in depth against collision).
      await db.run(
        `UPDATE migrations SET applied_at = '1970-01-01 00:00:00' WHERE name = 'unified_category_budget_model'`
      );

      const status = await getStatus(db);
      const initial = status.find((s) => s.name === '001_initial_schema');
      expect(initial?.isShadow).toBe(true);

      const unified = status.find((s) => s.name === 'unified_category_budget_model');
      expect(unified?.appliedAt).toBe('1970-01-01 00:00:00');
      expect(unified?.isShadow).toBe(false);

      const seed = status.find((s) => s.name === '002_seed_primary_household');
      expect(seed?.isShadow).toBe(false);
      expect(seed?.appliedAt).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  it('writes a pre-migration backup when pending migrations run against a populated DB', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nido-migrate-backup-'));
    const dbPath = path.join(tempDir, 'nido.test.db');

    // Seed the DB with a users row so the runner's "users.cnt > 0" guard passes.
    const seedDb = await open({ filename: dbPath, driver: sqlite3.Database });
    await seedDb.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT)`);
    await seedDb.run(`INSERT INTO users (username) VALUES ('alice')`);
    await seedDb.close();

    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    try {
      const noop: Migration = {
        name: 't_001_noop',
        up: async (database) => {
          await database.exec(`CREATE TABLE noop (id INTEGER PRIMARY KEY)`);
        },
        down: async (database) => {
          await database.exec(`DROP TABLE IF EXISTS noop`);
        },
      };

      const result = await runPendingMigrations(db, { dbPath, migrations: [noop] });
      expect(result.backupPath).toBeTruthy();
      expect(result.backupPath).toMatch(/\.pre-migration-/);

      const entries = await fs.readdir(tempDir);
      const backups = entries.filter((f) => f.startsWith('nido.test.db.pre-migration-'));
      expect(backups).toHaveLength(1);
      const stat = await fs.stat(path.join(tempDir, backups[0]));
      expect(stat.size).toBeGreaterThan(0);
    } finally {
      await db.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('skips the backup when the DB has no users rows (fresh / test fixture)', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nido-migrate-no-backup-'));
    const dbPath = path.join(tempDir, 'nido.test.db');

    // File exists, but no users table → backup gate fails closed.
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    try {
      const noop: Migration = {
        name: 't_001_noop',
        up: async (database) => {
          await database.exec(`CREATE TABLE noop (id INTEGER PRIMARY KEY)`);
        },
        down: async () => {},
      };
      const result = await runPendingMigrations(db, { dbPath, migrations: [noop] });
      expect(result.backupPath).toBeNull();
      const entries = await fs.readdir(tempDir);
      expect(entries.filter((f) => f.includes('pre-migration'))).toEqual([]);
    } finally {
      await db.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('011 rebuild succeeds inside the runner transaction against a DB with the legacy UNIQUE + FK-referencing rows', async () => {
    // The regression we're guarding against: PRAGMA foreign_keys=OFF is a
    // no-op inside SQLite transactions, so the original migration's
    // DROP+RENAME would fail or corrupt FKs when wrapped by the runner.
    // defer_foreign_keys=ON should keep the rebuild working.
    const { db, cleanup } = await openTempDb();
    try {
      // Build the legacy schema shape: categories WITH the old UNIQUE +
      // expenses with a category_id FK + 1 row of each so the FK is live.
      await db.exec(`
        CREATE TABLE households (id INTEGER PRIMARY KEY, slug TEXT, name TEXT);
        CREATE TABLE app_users (id INTEGER PRIMARY KEY, household_id INTEGER, username TEXT);
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          household_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          emoji TEXT NOT NULL,
          color TEXT NOT NULL,
          budget_amount REAL NOT NULL DEFAULT 0,
          context TEXT NOT NULL DEFAULT 'shared',
          owner_user_id INTEGER REFERENCES app_users(id) ON DELETE CASCADE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
          UNIQUE(household_id, name)
        );
        CREATE TABLE expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
          amount REAL
        );
      `);

      await db.run(`INSERT INTO households (id, slug, name) VALUES (1, 'primary', 'Test')`);
      await db.run(`INSERT INTO categories (household_id, name, emoji, color) VALUES (1, 'Food', '🍔', '#ff0000')`);
      await db.run(`INSERT INTO expenses (category_id, amount) VALUES (1, 42)`);

      // 011 is marked transactional: false — the runner calls up() directly
      // (no outer BEGIN/COMMIT) so the migration can disable FKs while it
      // rebuilds. We invoke it the same way here.
      expect(m011.transactional).toBe(false);
      await m011.up(db);

      // Old UNIQUE gone — same name in different context now allowed.
      const tblInfo = await db.get<{ sql: string }>(
        `SELECT sql FROM sqlite_master WHERE type='table' AND name='categories'`
      );
      expect(tblInfo?.sql.includes('UNIQUE(household_id, name)')).toBe(false);

      // Rows preserved with same ids.
      const cat = await db.get<{ id: number; name: string }>(
        `SELECT id, name FROM categories WHERE name='Food'`
      );
      expect(cat).toEqual({ id: 1, name: 'Food' });
      const exp = await db.get<{ id: number; category_id: number }>(
        `SELECT id, category_id FROM expenses WHERE amount=42`
      );
      expect(exp?.category_id).toBe(1);

      // FKs intact.
      const fkProblems = await db.all(`PRAGMA foreign_key_check`);
      expect(fkProblems).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it('003_sync_app_users_from_legacy.down() refuses rather than wiping the household', async () => {
    const { db, cleanup } = await openTempDb();
    try {
      await expect(m003.down(db)).rejects.toThrow(/not rollback-safe/);
    } finally {
      await cleanup();
    }
  });
});

describe('migrate runner — injected migrations', () => {
  const m1: Migration = {
    name: 't_001_alpha',
    up: async (db) => {
      await db.exec(`CREATE TABLE alpha (id INTEGER PRIMARY KEY, label TEXT)`);
    },
    down: async (db) => {
      await db.exec(`DROP TABLE IF EXISTS alpha`);
    },
  };

  const m2: Migration = {
    name: 't_002_beta',
    up: async (db) => {
      await db.exec(`CREATE TABLE beta (id INTEGER PRIMARY KEY, alpha_id INTEGER)`);
    },
    down: async (db) => {
      await db.exec(`DROP TABLE IF EXISTS beta`);
    },
  };

  const m3Failing: Migration = {
    name: 't_003_failing',
    up: async (db) => {
      await db.exec(`CREATE TABLE gamma (id INTEGER PRIMARY KEY)`);
      // Force a SQL error after partial work — runner's BEGIN/COMMIT must roll back the CREATE.
      await db.exec(`SELECT not_a_function_at_all()`);
    },
    down: async () => {},
  };

  it('rolls back the latest applied migration and refuses out-of-order targets', async () => {
    const { db, cleanup } = await openTempDb();
    const migrations = [m1, m2];
    try {
      await runPendingMigrations(db, { migrations });

      expect(await tableExists(db, 'alpha')).toBe(true);
      expect(await tableExists(db, 'beta')).toBe(true);

      // Trying to roll back the older migration when a newer one is applied should refuse.
      await expect(rollbackLast(db, { migrations, target: m1.name })).rejects.toThrow(
        /Refusing to roll back/
      );

      // Rolling back without a target rolls back the latest.
      const rolled = await rollbackLast(db, { migrations });
      expect(rolled).toBe(m2.name);
      expect(await tableExists(db, 'beta')).toBe(false);
      expect(await tableExists(db, 'alpha')).toBe(true);
      const remaining = await db.all<{ name: string }[]>(`SELECT name FROM migrations`);
      expect(remaining.map((r) => r.name)).toEqual([m1.name]);

      // Now t_001_alpha is the latest applied and CAN be rolled back when explicitly targeted.
      const rolled2 = await rollbackLast(db, { migrations, target: m1.name });
      expect(rolled2).toBe(m1.name);
      expect(await tableExists(db, 'alpha')).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('rolls back atomically when an up() throws mid-flight (no orphan table, no migration row)', async () => {
    const { db, cleanup } = await openTempDb();
    const migrations = [m1, m3Failing];
    try {
      await expect(runPendingMigrations(db, { migrations })).rejects.toThrow();

      // m1 should have committed before m3Failing ran
      expect(await tableExists(db, 'alpha')).toBe(true);
      // m3Failing created `gamma` then threw — the runner's ROLLBACK must have undone it
      expect(await tableExists(db, 'gamma')).toBe(false);
      // m3Failing must NOT appear in the migrations table
      const names = (await db.all<{ name: string }[]>(`SELECT name FROM migrations`)).map((r) => r.name);
      expect(names).toContain(m1.name);
      expect(names).not.toContain(m3Failing.name);
    } finally {
      await cleanup();
    }
  });

  it('idempotency: a second runPendingMigrations against an already-migrated DB applies nothing', async () => {
    const { db, cleanup } = await openTempDb();
    const migrations = [m1, m2];
    try {
      const first = await runPendingMigrations(db, { migrations });
      expect(first.applied).toEqual([m1.name, m2.name]);

      const second = await runPendingMigrations(db, { migrations });
      expect(second.applied).toEqual([]);
      // And calling it a third time is also stable
      const third = await runPendingMigrations(db, { migrations });
      expect(third.applied).toEqual([]);
    } finally {
      await cleanup();
    }
  });
});
