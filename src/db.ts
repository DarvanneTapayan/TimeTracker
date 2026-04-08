import { createPool } from '@vercel/postgres';
import path from 'path';

const usePostgres = !!process.env.POSTGRES_URL;

let sqliteDb: any;
let pgPool: any;

// Lazy load better-sqlite3 only when needed (not on Vercel)
const getSqliteDb = async () => {
  if (!sqliteDb) {
    const { default: Database } = await import('better-sqlite3');
    const dbPath = path.resolve(process.cwd(), 'payroll.db');
    sqliteDb = new Database(dbPath);
  }
  return sqliteDb;
};

if (usePostgres) {
  pgPool = createPool();
}

export const query = async (text: string, params: any[] = []) => {
  if (usePostgres) {
    let i = 1;
    const pgText = text.replace(/\?/g, () => `$${i++}`);
    const { rows } = await pgPool.query(pgText, params);
    return rows;
  } else {
    const db = await getSqliteDb();
    const stmt = db.prepare(text);
    if (text.trim().toUpperCase().startsWith('SELECT')) {
      return stmt.all(...params);
    } else {
      const result = stmt.run(...params);
      return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
    }
  }
};

export const queryOne = async (text: string, params: any[] = []) => {
  const rows = await query(text, params);
  return rows.length > 0 ? rows[0] : null;
};

export const initDb = async () => {
  if (usePostgres) {
    await pgPool.sql`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        hourly_rate REAL NOT NULL
      );
    `;
    await pgPool.sql`
      CREATE TABLE IF NOT EXISTS time_logs (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        total_hours REAL,
        daily_pay REAL,
        FOREIGN KEY (employee_id) REFERENCES employees (id)
      );
    `;
    await pgPool.sql`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `;

    const employees = await query('SELECT COUNT(*) as count FROM employees');
    if (parseInt(employees[0].count) === 0) {
      await query('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)', ['Administrator', 'admin', 'admin123', 'admin', 0]);
      await query('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)', ['Juan Dela Cruz', 'juan', 'password123', 'employee', 150]);
    }

    const settings = await query('SELECT COUNT(*) as count FROM settings');
    if (parseInt(settings[0].count) === 0) {
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', ['clock_in_start', '22:55']);
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', ['auto_stop_time', '07:00']);
    }
  } else {
    const db = await getSqliteDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee',
        hourly_rate REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS time_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        total_hours REAL,
        daily_pay REAL,
        FOREIGN KEY (employee_id) REFERENCES employees (id)
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
    if (employeeCount.count === 0) {
      db.prepare('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)').run('Administrator', 'admin', 'admin123', 'admin', 0);
      db.prepare('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)').run('Juan Dela Cruz', 'juan', 'password123', 'employee', 150);
    }

    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM settings').get() as { count: number };
    if (settingsCount.count === 0) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('clock_in_start', '22:55');
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('auto_stop_time', '07:00');
    }
  }
};
