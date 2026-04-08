import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { query, queryOne, initDb } from "./src/db.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize database
  await initDb();

  app.use(express.json());

  // API Routes
  
  // Login
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await queryOne('SELECT id, name, username, role, hourly_rate FROM employees WHERE username = ? AND password = ?', [username, password]);
    
    if (user) {
      const activeLog = await queryOne('SELECT id, start_time FROM time_logs WHERE employee_id = ? AND end_time IS NULL LIMIT 1', [user.id]);
      res.json({ ...user, active_log: activeLog || null });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Get all employees (Admin only)
  app.get("/api/employees", async (req, res) => {
    const employees = await query(`
      SELECT id, name, username, password, role, hourly_rate
      FROM employees
      WHERE role = 'employee'
    `);
    res.json(employees);
  });

  // Create employee
  app.post("/api/employees", async (req, res) => {
    const { name, username, password, hourly_rate } = req.body;
    try {
      const rows = await query('INSERT INTO employees (name, username, password, role, hourly_rate) VALUES (?, ?, ?, ?, ?)', [name, username, password, 'employee', hourly_rate]) as any[];
      res.json({ id: rows[0].id });
    } catch (err: any) {
      if (err.message.includes('UNIQUE constraint failed') || err.message.includes('unique constraint')) {
        res.status(400).json({ error: "Username already exists" });
      } else {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Update employee
  app.put("/api/employees/:id", async (req, res) => {
    const { name, username, password, hourly_rate } = req.body;
    await query('UPDATE employees SET name = ?, username = ?, password = ?, hourly_rate = ? WHERE id = ?', [name, username, password, hourly_rate, req.params.id]);
    res.json({ success: true });
  });

  // Delete employee
  app.delete("/api/employees/:id", async (req, res) => {
    const { id } = req.params;
    try {
      // Delete logs first due to foreign key
      await query('DELETE FROM time_logs WHERE employee_id = ?', [id]);
      await query('DELETE FROM employees WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to delete employee', err);
      res.status(500).json({ error: "Failed to delete employee" });
    }
  });

  // Settings
  app.get("/api/settings", async (req, res) => {
    const settings = await query('SELECT * FROM settings') as any[];
    const result = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {
      clock_in_start: '22:55',
      auto_stop_time: '07:00'
    });
    res.json(result);
  });

  app.put("/api/settings", async (req, res) => {
    const { clock_in_start, auto_stop_time } = req.body;
    if (clock_in_start) {
      // Use Postgres-friendly UPSERT if possible, but simple delete/insert is safer for both
      await query('DELETE FROM settings WHERE key = ?', ['clock_in_start']);
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', ['clock_in_start', clock_in_start]);
    }
    if (auto_stop_time) {
      await query('DELETE FROM settings WHERE key = ?', ['auto_stop_time']);
      await query('INSERT INTO settings (key, value) VALUES (?, ?)', ['auto_stop_time', auto_stop_time]);
    }
    res.json({ success: true });
  });

  function isTimeInRange(now: Date, startStr: string, endStr: string) {
    const [sH, sM] = startStr.split(':').map(Number);
    const [eH, eM] = endStr.split(':').map(Number);
    const nowH = now.getHours();
    const nowM = now.getMinutes();

    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;
    const nowMin = nowH * 60 + nowM;

    if (startMin <= endMin) {
      return nowMin >= startMin && nowMin <= endMin;
    } else {
      return nowMin >= startMin || nowMin <= endMin;
    }
  }

  // Clock In
  app.post("/api/clock-in", async (req, res) => {
    const { employee_id } = req.body;
    const now = new Date();
    
    const settings = await query('SELECT * FROM settings') as any[];
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {
      clock_in_start: '22:55',
      auto_stop_time: '07:00'
    });
    
    if (!isTimeInRange(now, config.clock_in_start, config.auto_stop_time)) {
      return res.status(400).json({ 
        error: `Clock-in is only allowed between ${config.clock_in_start} and ${config.auto_stop_time}.` 
      });
    }

    const startTime = now.toISOString();
    
    // Check if already clocked in
    const existing = await queryOne('SELECT id FROM time_logs WHERE employee_id = ? AND end_time IS NULL', [employee_id]);
    if (existing) {
      return res.status(400).json({ error: "Already clocked in" });
    }

    const result = await query('INSERT INTO time_logs (employee_id, start_time) VALUES (?, ?)', [employee_id, startTime]) as any[];
    res.json({ id: result[0].id, start_time: startTime });
  });

  // Clock Out
  app.post("/api/clock-out", async (req, res) => {
    const { employee_id } = req.body;
    let endTimeDate = new Date();
    
    const activeLog = await queryOne('SELECT * FROM time_logs WHERE employee_id = ? AND end_time IS NULL', [employee_id]) as any;
    if (!activeLog) {
      return res.status(400).json({ error: "Not clocked in" });
    }

    const settings = await query('SELECT * FROM settings') as any[];
    const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {
      clock_in_start: '22:55',
      auto_stop_time: '07:00'
    });
    const [stopH, stopM] = config.auto_stop_time.split(':').map(Number);

    // Auto-stop logic
    const start = new Date(activeLog.start_time);
    const stopTime = new Date(start);
    
    const startH = start.getHours();
    if (startH >= stopH) {
      stopTime.setDate(stopTime.getDate() + 1);
    }
    stopTime.setHours(stopH, stopM, 0, 0);

    if (endTimeDate > stopTime) {
      endTimeDate = stopTime;
    }

    const endTime = endTimeDate.toISOString();
    const employee = await queryOne('SELECT hourly_rate FROM employees WHERE id = ?', [employee_id]) as any;
    
    const startTimeMs = start.getTime();
    const endTimeMs = endTimeDate.getTime();
    const durationHours = (endTimeMs - startTimeMs) / (1000 * 60 * 60);
    const cappedHours = Math.min(durationHours, 8);
    const dailyPay = cappedHours * employee.hourly_rate;

    await query(`
      UPDATE time_logs 
      SET end_time = ?, total_hours = ?, daily_pay = ? 
      WHERE id = ?
    `, [endTime, cappedHours, dailyPay, activeLog.id]);

    res.json({ success: true, total_hours: cappedHours, daily_pay: dailyPay, end_time: endTime });
  });

  // Get logs for employee (current week)
  app.get("/api/logs/:employeeId", async (req, res) => {
    // Postgres doesn't have datetime() exactly like SQLite, but we can use simple string comparison or TO_TIMESTAMP
    // For simplicity and cross-compatibility, we'll use a standard SQL approach
    const logs = await query(`
      SELECT * FROM time_logs 
      WHERE employee_id = ? 
      ORDER BY start_time DESC
      LIMIT 50
    `, [req.params.employeeId]);
    res.json(logs);
  });

  // Admin: Get all logs
  app.get("/api/admin/logs", async (req, res) => {
    const logs = await query(`
      SELECT l.*, e.name as employee_name, e.hourly_rate
      FROM time_logs l
      JOIN employees e ON l.employee_id = e.id
      ORDER BY l.start_time DESC
    `);
    res.json(logs);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
