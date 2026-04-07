import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'payroll.db');
const db = new Database(dbPath);

// Initialize tables
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

// Seed initial data if empty
const employeeCount = db.prepare('SELECT COUNT(*) as count FROM employees').get() as { count: number };
if (employeeCount.count === 0) {
  // Admin user
  db.prepare('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)')
    .run('Administrator', 'admin', 'admin123', 'admin', 0);
  
  // Sample employee
  db.prepare('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)')
    .run('Juan Dela Cruz', 'juan', 'password123', 'employee', 150);

  // Default settings
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('clock_in_start', '22:55');
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('auto_stop_time', '07:00');
}

export default db;

/**
 * SQL Schema for reference:
 * 
 * CREATE TABLE employees (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   name TEXT NOT NULL,
 *   username TEXT UNIQUE NOT NULL,
 *   password TEXT NOT NULL,
 *   role TEXT NOT NULL DEFAULT 'employee', -- 'admin' or 'employee'
 *   hourly_rate REAL NOT NULL
 * );
 * 
 * CREATE TABLE time_logs (
 *   id INTEGER PRIMARY KEY AUTOINCREMENT,
 *   employee_id INTEGER NOT NULL,
 *   start_time TEXT NOT NULL, -- ISO 8601 string
 *   end_time TEXT,            -- ISO 8601 string
 *   total_hours REAL,         -- Calculated as min(diff, 8)
 *   daily_pay REAL,           -- total_hours * hourly_rate
 *   FOREIGN KEY (employee_id) REFERENCES employees (id)
 * );
 */
