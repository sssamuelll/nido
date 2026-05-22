/**
 * Versioned migration runner for Nido (issue #91).
 *
 * Replaces the historical ad-hoc CREATE-IF-NOT-EXISTS + ensureColumn pattern in
 * server/db.ts with discrete migration files under server/migrations/, each
 * exporting { name, up, down }.
 *
 * The runner:
 *   - auto-discovers server/migrations/NNN_*.{ts,js} ordered by filename
 *   - records applied migrations in the existing `migrations` table
 *   - runs each pending migration inside its own BEGIN/COMMIT (ROLLBACK on
 *     failure, then aborts the boot)
 *   - shadow-registers the schema migrations on a pre-versioned prod DB
 *     (detected via the post-001 table set) so we don't re-run schema work
 *   - snapshots the DB file to `<dbPath>.pre-migration-<iso>` before applying
 *     against a non-empty DB, capped at MAX_BACKUPS copies
 *
 * Migration up() bodies should still use IF NOT EXISTS / ensureColumn-style
 * guards: the runner's bootstrap covers prod, but server/db.test.ts exercises
 * a truly ancient legacy DB (users+expenses without sessions/app_users) that
 * would not match bootstrap detection. Idempotent SQL is the safety net.
 */

import sqlite3 from 'sqlite3';
import type { Database } from 'sqlite';
import { open } from 'sqlite';
import { pathToFileURL, fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';
import { databaseUrl } from './config.js';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Migration {
  name: string;
  up(db: Database): Promise<void>;
  down(db: Database): Promise<void>;
  /**
   * Default `true`: the runner wraps up()/down() in BEGIN/COMMIT and ROLLBACKs
   * on throw. Set `false` for migrations that need PRAGMAs SQLite refuses to
   * honor inside a transaction (e.g. `foreign_keys=OFF` — see migration 011).
   * Non-transactional migrations are responsible for their own atomicity; the
   * runner still records the migration name after `up()` returns successfully.
   */
  transactional?: boolean;
}

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'nido.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const BOOTSTRAP_SHADOW_TIMESTAMP = '1970-01-01 00:00:00';
const MAX_BACKUPS = 5;

// Migrations that introduce schema. If their names aren't in the migrations
// table BUT the schema is already present (prod pre-versioning), the runner
// inserts shadow rows so the up() doesn't re-run.
const SCHEMA_MIGRATION_NAMES = ['001_initial_schema', '002_seed_primary_household'];

// Tables that must all exist for bootstrap detection to fire. Choosing the
// post-001 set (not the full table list) keeps the check conservative — a
// partial DB that's missing some of these isn't auto-bootstrapped, it falls
// through to the normal pending-migration path (where IF NOT EXISTS handles
// any overlap with the legacy ancient-test schema).
const POST_001_TABLES = [
  'users',
  'expenses',
  'sessions',
  'app_users',
  'households',
  'categories',
];

// Migration file naming: NNN_descriptive_name.{ts,js} where NNN is exactly
// three digits. The fixed-width prefix is what gives us deterministic ordering
// via plain filename sort. If we ever exceed 999 migrations, this regex (and
// the SCHEMA_MIGRATION_NAMES list) must widen — file names beyond that won't
// be loaded silently otherwise.
const MIGRATION_FILE_RE = /^(\d{3})_[A-Za-z0-9_]+\.(ts|js)$/;

async function loadMigrations(): Promise<Migration[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(MIGRATIONS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  // Prefer .ts in dev (tsx); .js in compiled prod. If both exist for the same
  // NNN_name prefix, keep the .ts (dev should always use source).
  const byPrefix = new Map<string, string>();
  for (const entry of entries) {
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.js')) continue;
    const match = entry.match(MIGRATION_FILE_RE);
    if (!match) continue;
    const prefix = entry.slice(0, entry.lastIndexOf('.'));
    const existing = byPrefix.get(prefix);
    if (!existing || (existing.endsWith('.js') && entry.endsWith('.ts'))) {
      byPrefix.set(prefix, entry);
    }
  }

  const files = [...byPrefix.values()].sort();
  const migrations: Migration[] = [];
  for (const file of files) {
    const full = path.join(MIGRATIONS_DIR, file);
    const url = pathToFileURL(full).href;
    const mod = (await import(url)) as Partial<Migration>;
    if (!mod.name) throw new Error(`migration ${file} is missing exported "name"`);
    if (typeof mod.up !== 'function') throw new Error(`migration ${file} is missing exported "up"`);
    if (typeof mod.down !== 'function') throw new Error(`migration ${file} is missing exported "down"`);
    migrations.push({
      name: mod.name,
      up: mod.up,
      down: mod.down,
      transactional: mod.transactional,
    });
  }
  return migrations;
}

async function ensureMigrationsTable(db: Database): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function listAppliedNames(db: Database): Promise<string[]> {
  const rows = await db.all<{ name: string }[]>(`SELECT name FROM migrations`);
  return rows.map((r) => r.name);
}

async function listExistingTables(db: Database): Promise<Set<string>> {
  const rows = await db.all<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table'`
  );
  return new Set(rows.map((r) => r.name));
}

interface BootstrapResult {
  shadowRegister: string[];
  reason: string;
}

async function detectBootstrap(
  db: Database,
  applied: Set<string>
): Promise<BootstrapResult> {
  const tables = await listExistingTables(db);
  const hasAllPost001 = POST_001_TABLES.every((t) => tables.has(t));
  if (!hasAllPost001) {
    return { shadowRegister: [], reason: 'fresh or partial DB; nothing to shadow' };
  }

  const toShadow = SCHEMA_MIGRATION_NAMES.filter((n) => !applied.has(n));
  if (toShadow.length === 0) {
    return { shadowRegister: [], reason: 'schema present and tracked' };
  }

  return {
    shadowRegister: toShadow,
    reason: `pre-versioned schema detected (has [${POST_001_TABLES.join(', ')}]); shadow-registering [${toShadow.join(', ')}]`,
  };
}

async function preMigrationBackup(dbPath: string): Promise<string | null> {
  // Only back up when the file exists and has user data — otherwise this is a
  // fresh DB or a test fixture and the backup is noise.
  try {
    const st = await fs.stat(dbPath);
    if (!st.isFile() || st.size === 0) return null;
  } catch {
    return null;
  }

  let hasUsers = false;
  const probe = await open({ filename: dbPath, driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    const tbl = await probe.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`
    );
    if (tbl) {
      const cnt = await probe.get<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM users`);
      hasUsers = (cnt?.cnt ?? 0) > 0;
    }
  } finally {
    await probe.close();
  }
  if (!hasUsers) return null;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.pre-migration-${ts}`;
  await fs.copyFile(dbPath, backupPath);
  logger.info({ backupPath }, 'pre-migration backup created');

  await pruneOldBackups(dbPath);
  return backupPath;
}

async function pruneOldBackups(dbPath: string): Promise<void> {
  const dir = path.dirname(dbPath);
  const base = path.basename(dbPath);
  const entries = await fs.readdir(dir);
  // The ISO timestamp suffix (with `:` and `.` swapped for `-` so Windows
  // accepts them in a filename) preserves lexicographic ordering — older
  // backups sort earlier. The first `len - MAX_BACKUPS` entries are the ones
  // we drop. Don't replace this with parseDate-and-sort unless you also
  // confirm the suffix format hasn't changed.
  const backups = entries
    .filter((f) => f.startsWith(`${base}.pre-migration-`))
    .sort();
  if (backups.length <= MAX_BACKUPS) return;
  const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
  for (const name of toDelete) {
    const p = path.join(dir, name);
    await fs.unlink(p).catch(() => {});
    logger.info({ deletedBackup: p }, 'pruned old pre-migration backup');
  }
}

export interface RunOptions {
  /** Path to the SQLite file, used for the pre-migration backup. Omit to skip backups. */
  dbPath?: string;
  /** Override the discovered migration list. Test-only; production callers should omit this. */
  migrations?: Migration[];
}

export interface RunResult {
  applied: string[];
  shadowRegistered: string[];
  backupPath: string | null;
}

export async function runPendingMigrations(
  db: Database,
  options: RunOptions = {}
): Promise<RunResult> {
  await ensureMigrationsTable(db);
  const migrations = options.migrations ?? (await loadMigrations());
  const appliedNames = await listAppliedNames(db);
  const applied = new Set(appliedNames);

  const bootstrap = await detectBootstrap(db, applied);
  if (bootstrap.shadowRegister.length > 0) {
    logger.info({ shadow: bootstrap.shadowRegister, reason: bootstrap.reason }, 'bootstrap shadow-register');
    for (const name of bootstrap.shadowRegister) {
      await db.run(
        `INSERT OR IGNORE INTO migrations (name, applied_at) VALUES (?, ?)`,
        name,
        BOOTSTRAP_SHADOW_TIMESTAMP
      );
      applied.add(name);
    }
  }

  const pending = migrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) {
    return { applied: [], shadowRegistered: bootstrap.shadowRegister, backupPath: null };
  }

  let backupPath: string | null = null;
  if (options.dbPath) {
    backupPath = await preMigrationBackup(options.dbPath);
  }

  const justApplied: string[] = [];
  for (const m of pending) {
    logger.info({ migration: m.name, transactional: m.transactional !== false }, 'applying migration');
    if (m.transactional === false) {
      try {
        await m.up(db);
      } catch (err) {
        logger.error({ err, migration: m.name }, 'migration failed; aborting boot');
        throw err;
      }
      // Recorded outside the migration's own transaction. If this INSERT
      // throws (unlikely — would mean disk full or DB locked), the migration
      // is in an "applied but unrecorded" state and will re-run on next boot.
      // The migration's up() must be re-runnable to make that recovery safe;
      // 011 is, via the `sqlite_master.sql` legacy-UNIQUE check.
      await db.run(`INSERT INTO migrations (name) VALUES (?)`, m.name);
      justApplied.push(m.name);
    } else {
      await db.exec('BEGIN');
      try {
        await m.up(db);
        await db.run(`INSERT INTO migrations (name) VALUES (?)`, m.name);
        await db.exec('COMMIT');
        justApplied.push(m.name);
      } catch (err) {
        await db.exec('ROLLBACK').catch(() => {});
        logger.error({ err, migration: m.name }, 'migration failed; aborting boot');
        throw err;
      }
    }
  }

  logger.info({ count: justApplied.length, names: justApplied }, 'migrations applied');
  return { applied: justApplied, shadowRegistered: bootstrap.shadowRegister, backupPath };
}

export interface RollbackOptions {
  /** If provided, the runner refuses unless the latest applied migration matches. */
  target?: string;
  /** Override the discovered migration list. Test-only. */
  migrations?: Migration[];
}

export async function rollbackLast(
  db: Database,
  options: RollbackOptions = {}
): Promise<string | null> {
  await ensureMigrationsTable(db);
  const migrations = options.migrations ?? (await loadMigrations());
  const appliedNames = await listAppliedNames(db);
  if (appliedNames.length === 0) return null;

  const appliedSet = new Set(appliedNames);
  const appliedInOrder = migrations.filter((m) => appliedSet.has(m.name));
  if (appliedInOrder.length === 0) return null;

  const last = appliedInOrder[appliedInOrder.length - 1];
  if (options.target && options.target !== last.name) {
    throw new Error(
      `Refusing to roll back "${options.target}": newer migrations are applied (${last.name}). ` +
        `Roll back in reverse order, one at a time.`
    );
  }

  logger.info(
    { migration: last.name, transactional: last.transactional !== false },
    'rolling back migration'
  );
  if (last.transactional === false) {
    try {
      await last.down(db);
    } catch (err) {
      logger.error({ err, migration: last.name }, 'rollback failed');
      throw err;
    }
    await db.run(`DELETE FROM migrations WHERE name = ?`, last.name);
  } else {
    await db.exec('BEGIN');
    try {
      await last.down(db);
      await db.run(`DELETE FROM migrations WHERE name = ?`, last.name);
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK').catch(() => {});
      logger.error({ err, migration: last.name }, 'rollback failed');
      throw err;
    }
  }
  logger.info({ migration: last.name }, 'rollback complete');
  return last.name;
}

export interface StatusRow {
  name: string;
  appliedAt: string | null;
  isShadow: boolean;
}

export async function getStatus(db: Database, options: { migrations?: Migration[] } = {}): Promise<StatusRow[]> {
  await ensureMigrationsTable(db);
  const migrations = options.migrations ?? (await loadMigrations());
  const appliedRows = await db.all<{ name: string; applied_at: string }[]>(
    `SELECT name, applied_at FROM migrations`
  );
  const appliedMap = new Map(appliedRows.map((r) => [r.name, r.applied_at]));
  const schemaSet = new Set(SCHEMA_MIGRATION_NAMES);
  return migrations.map((m) => {
    const appliedAt = appliedMap.get(m.name) ?? null;
    // Only schema migrations are eligible for shadow status — a real apply
    // that somehow lands on the bootstrap timestamp (clock skew, hand-edited
    // SQL, restore from an ancient backup) for a non-schema migration is
    // misclassified if we trust the timestamp alone.
    const isShadow = appliedAt === BOOTSTRAP_SHADOW_TIMESTAMP && schemaSet.has(m.name);
    return {
      name: m.name,
      appliedAt,
      isShadow,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function openCliDb(): Promise<{ db: Database; dbPath: string }> {
  const dbPath = databaseUrl || DEFAULT_DB_PATH;
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');
  return { db, dbPath };
}

async function cliStatus(): Promise<void> {
  const { db } = await openCliDb();
  try {
    const status = await getStatus(db);
    if (status.length === 0) {
      process.stdout.write('No migrations defined.\n');
      return;
    }
    process.stdout.write('Migration status:\n');
    for (const s of status) {
      const tag = s.appliedAt ? (s.isShadow ? 'SHADOW ' : 'APPLIED') : 'PENDING';
      const when = s.appliedAt ? `  ${s.appliedAt}` : '';
      process.stdout.write(`  [${tag}] ${s.name}${when}\n`);
    }
  } finally {
    await db.close();
  }
}

async function cliUp(): Promise<void> {
  const { db, dbPath } = await openCliDb();
  try {
    const { applied, shadowRegistered, backupPath } = await runPendingMigrations(db, { dbPath });
    if (backupPath) process.stdout.write(`Pre-migration backup: ${backupPath}\n`);
    if (shadowRegistered.length > 0) {
      process.stdout.write(`Shadow-registered: ${shadowRegistered.join(', ')}\n`);
    }
    if (applied.length === 0) {
      process.stdout.write('Nothing pending.\n');
    } else {
      process.stdout.write(`Applied: ${applied.join(', ')}\n`);
    }
  } finally {
    await db.close();
  }
}

async function cliDown(target?: string): Promise<void> {
  const { db } = await openCliDb();
  try {
    const rolled = await rollbackLast(db, { target });
    if (rolled) {
      process.stdout.write(`Rolled back: ${rolled}\n`);
    } else {
      process.stdout.write('Nothing to roll back.\n');
    }
  } finally {
    await db.close();
  }
}

const isMain = (() => {
  try {
    if (!process.argv[1]) return false;
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const [, , cmd, arg] = process.argv;
  const run = async () => {
    switch (cmd) {
      case 'status':
        await cliStatus();
        break;
      case 'up':
        await cliUp();
        break;
      case 'down':
        await cliDown(arg);
        break;
      default:
        process.stderr.write(`Usage: tsx server/migrate.ts <status|up|down [name]>\n`);
        process.exit(1);
    }
  };
  run().catch((err) => {
    process.stderr.write(`migrate failed: ${err?.message ?? err}\n`);
    if (err?.stack) process.stderr.write(`${err.stack}\n`);
    process.exit(1);
  });
}
