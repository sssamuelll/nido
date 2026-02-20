import sqlite3 from 'sqlite3';
import { Database, open } from 'sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

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
  const defaultPassword = process.env.DEFAULT_PASSWORD || 'changeme';
  const saltedPassword = bcrypt.hashSync(defaultPassword, 10);

  await db.run('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)', ['samuel', saltedPassword]);
  await db.run('INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)', ['maria', saltedPassword]);

  // Seed February 2026 budget
  await db.run(`
    INSERT OR IGNORE INTO budgets (month, total_budget, rent, savings, personal_samuel, personal_maria)
    VALUES (?, ?, ?, ?, ?, ?)
  `, ['2026-02', 2800, 335, 300, 500, 500]);

  // Seed expenses for February 2026
  const seedExpenses = [
    ['Desayunito after ballet', 27.70, 'Restaurant', '2026-02-14', 'samuel', 'shared'],
    ['Cenita rica en Crazy Nates', 57.85, 'Restaurant', '2026-02-12', 'samuel', 'shared'],
    ['Cervesitas en Crazynates', 17.00, 'Restaurant', '2026-02-12', 'samuel', 'shared'],
    ['Cenita en Clubhouse', 60.20, 'Restaurant', '2026-02-11', 'samuel', 'shared'],
    ['Asquerositos de Ikea', 6.00, 'Restaurant', '2026-02-11', 'samuel', 'shared'],
    ['Almuerzo de chorizzo', 13.40, 'Restaurant', '2026-02-11', 'samuel', 'shared'],
    ['Cenita rica en Hot Tacos', 35.60, 'Restaurant', '2026-02-10', 'samuel', 'shared'],
    ['Cenita rica en Kokono (Sushi!)', 70.00, 'Restaurant', '2026-02-08', 'samuel', 'shared'],
    ['Fürthemare bebiditas', 13.50, 'Restaurant', '2026-02-08', 'samuel', 'shared'],
    ['Desayunito rico en Stadtparkcafe', 41.80, 'Restaurant', '2026-02-08', 'samuel', 'shared'],
    ['Cocktails en Oto Willich', 24.50, 'Ocio', '2026-02-08', 'samuel', 'shared'],
    ['Cena en restaurante italiano', 50.44, 'Restaurant', '2026-02-07', 'samuel', 'shared'],
    ['Desayuno', 9.40, 'Restaurant', '2026-02-07', 'samuel', 'shared'],
    ['Cerveza en Club Society', 4.90, 'Ocio', '2026-02-05', 'samuel', 'shared'],
    ['Cena en Sora Mirai', 41.80, 'Restaurant', '2026-02-05', 'samuel', 'shared']
  ];

  for (const expense of seedExpenses) {
    await db.run(`
      INSERT OR IGNORE INTO expenses (description, amount, category, date, paid_by, type)
      VALUES (?, ?, ?, ?, ?, ?)
    `, expense);
  }

  console.log('Database initialized with seed data');
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