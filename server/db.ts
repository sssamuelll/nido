import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultPassword as envDefaultPassword, isProduction } from './config.js';

const format = (d: Date, fmt: string) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db: Database;

// Initialize database
const initDatabase = async () => {
  db = await open({
    filename: path.join(__dirname, '..', 'nido.db'),
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON');

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT UNIQUE NOT NULL,
      total_budget REAL NOT NULL,
      rent REAL NOT NULL,
      savings REAL NOT NULL,
      personal_samuel REAL NOT NULL,
      personal_maria REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      paid_by TEXT NOT NULL CHECK (paid_by IN ('samuel', 'maria')),
      type TEXT NOT NULL CHECK (type IN ('shared', 'personal')),
      status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
    CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
  `);

  // Seed users
  let defaultPassword = envDefaultPassword;
  let passwordSource = 'env';
  
  if (!defaultPassword && !isProduction) {
    // Generate a random password for development
    defaultPassword = randomBytes(12).toString('hex');
    passwordSource = 'generated';
    console.warn(`⚠️  DEFAULT_PASSWORD not set in development. Generated random password: ${defaultPassword}`);
    console.warn('   Please set DEFAULT_PASSWORD in .env for consistency.');
  }

  if (defaultPassword) {
    const saltedPassword = bcrypt.hashSync(defaultPassword, 10);
    await db.run('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)', ['samuel', saltedPassword]);
    await db.run('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)', ['maria', saltedPassword]);
    console.log(`Seeded default users (password from ${passwordSource})`);
  } else if (isProduction) {
    console.log('Skipping user seeding in production - DEFAULT_PASSWORD not set (assuming existing users)');
  } else {
    // Should not happen: development but defaultPassword empty (only if envDefaultPassword empty and randomBytes fails?)
    console.warn('⚠️  No DEFAULT_PASSWORD set and unable to generate one. Skipping user seeding.');
  }

  // Seed default budget if none exists
  await db.run(`
    INSERT OR IGNORE INTO budgets (month, total_budget, rent, savings, personal_samuel, personal_maria)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [format(new Date(), 'yyyy-MM'), 2800, 335, 300, 500, 500]);

  console.log('Database initialized');
};

// Initialize the database
initDatabase().catch(console.error);

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

export default { getDatabase };