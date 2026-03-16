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
export const initDatabase = async () => {
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
      pin TEXT DEFAULT '1234',
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

    CREATE TABLE IF NOT EXISTS category_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      UNIQUE(month, category)
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON expenses(paid_by);
    CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
  `);

  // Migrations: Ensure 'pin' column exists
  try {
    await db.exec('ALTER TABLE users ADD COLUMN pin TEXT DEFAULT "1234"');
  } catch (e) {
    // Column already exists
  }

  // Seed users
  let defaultPassword = envDefaultPassword;
  let passwordSource = 'env';
  
  if (!defaultPassword && !isProduction) {
    defaultPassword = randomBytes(12).toString('hex');
    passwordSource = 'generated';
    console.warn(`⚠️  DEFAULT_PASSWORD not set in development. Generated random password: ${defaultPassword}`);
    console.warn('   Please set DEFAULT_PASSWORD in .env for consistency.');
  }

  if (defaultPassword) {
    const saltedPassword = bcrypt.hashSync(defaultPassword, 10);
    await db.run('INSERT OR IGNORE INTO users (username, password, pin) VALUES (?, ?, ?)', ['samuel', saltedPassword, '1234']);
    await db.run('INSERT OR IGNORE INTO users (username, password, pin) VALUES (?, ?, ?)', ['maria', saltedPassword, '1234']);
    console.log(`Seeded default users (password from ${passwordSource})`);
  } else if (isProduction) {
    console.log('Skipping user seeding in production - DEFAULT_PASSWORD not set (assuming existing users)');
  }

  // Seed default budget if none exists
  await db.run(`
    INSERT OR IGNORE INTO budgets (month, total_budget, rent, savings, personal_samuel, personal_maria)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [format(new Date(), 'yyyy-MM'), 2800, 335, 300, 500, 500]);

  // Seed default category budgets
  const categories = ['Restaurant', 'Gastos', 'Servicios', 'Ocio', 'Inversión', 'Otros'];
  const defaultCategoryAmounts: Record<string, number> = {
    'Restaurant': 200,
    'Gastos': 400,
    'Servicios': 150,
    'Ocio': 200,
    'Inversión': 100,
    'Otros': 115
  };

  for (const cat of categories) {
    await db.run(`
      INSERT OR IGNORE INTO category_budgets (month, category, amount)
      VALUES (?, ?, ?)
    `, [format(new Date(), 'yyyy-MM'), cat, defaultCategoryAmounts[cat] || 0]);
  }

  console.log('Database initialized');
};

export const getDatabase = () => {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
};

export default { getDatabase };